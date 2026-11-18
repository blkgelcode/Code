// The frame engine: frame-exact video decoding with WebCodecs.
//
// For each video (its proxy, or the original in Full quality) it reads the MP4 index with a few
// range requests, then decodes one GOP (keyframe → next keyframe, one second in a proxy) at a time
// from a single range request. Decoded frames become GPU ImageBitmaps in a shared cache, so:
//   - scrubbing inside a second you've seen is instant; elsewhere it's one GOP decode,
//   - playback (forward or reverse, any speed) decodes the next GOP ahead of the playhead,
//   - the decoder never runs dry of output buffers (VideoFrames are closed right away).
// Nothing ever downloads a whole file.
import { openMovie, indexFrames, frameAt, type Movie, type Track, type FrameIndex } from "./mp4";

export type Bitmap = ImageBitmap;
const MB = 1024 * 1024;

// ------------------------------------------------------------------ shared LRU cache
class FrameCache {
  private map = new Map<string, { bmp: Bitmap; bytes: number }>();
  bytes = 0;
  constructor(public budget: number) {}
  get(key: string) {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key); this.map.set(key, e); // most recently used goes last
    return e.bmp;
  }
  has(key: string) { return this.map.has(key); }
  put(key: string, bmp: Bitmap) {
    const old = this.map.get(key);
    if (old) { this.bytes -= old.bytes; old.bmp.close(); this.map.delete(key); }
    const bytes = bmp.width * bmp.height * 4;
    this.map.set(key, { bmp, bytes });
    this.bytes += bytes;
    for (const [k, e] of this.map) {
      if (this.bytes <= this.budget) break;
      if (k === key) continue;
      e.bmp.close(); this.bytes -= e.bytes; this.map.delete(k);
    }
  }
  dropPrefix(prefix: string) {
    for (const [k, e] of this.map) if (k.startsWith(prefix)) { e.bmp.close(); this.bytes -= e.bytes; this.map.delete(k); }
  }
  get count() { return this.map.size; }
}

// ------------------------------------------------------------------ one video file
export type SourceState = "opening" | "ready" | "unsupported" | "error";

class VideoSource {
  state: SourceState = "opening";
  error = "";
  movie?: Movie;
  track?: Track;
  ix?: FrameIndex;
  fps = 30;
  private decoder?: VideoDecoder;
  private config?: VideoDecoderConfig;
  private chain: Promise<unknown> = Promise.resolve();
  private gopsDone = new Set<number>();
  private gopsPending = new Map<number, Promise<void>>();
  private wantedGop = -1;
  readonly ready: Promise<void>;
  stats = { gopsDecoded: 0, framesDecoded: 0, bytesRead: 0 };

  constructor(readonly key: string, readonly url: string, private cache: FrameCache, private onFrames: () => void) {
    this.ready = this.open().catch((e) => { this.state = "error"; this.error = String(e?.message || e); });
  }

  private async read(start: number, end: number) {
    const r = await fetch(this.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status} reading ${this.url}`);
    const b = new Uint8Array(await r.arrayBuffer());
    this.stats.bytesRead += b.length;
    return b;
  }

  private async open() {
    const head = await fetch(this.url, { headers: { Range: "bytes=0-0" } });
    const total = Number(/\/(\d+)$/.exec(head.headers.get("content-range") || "")?.[1] || head.headers.get("content-length"));
    await head.arrayBuffer().catch(() => {});
    if (!total) throw new Error("couldn't get the file size");
    this.movie = await openMovie((s, e) => this.read(s, e), total);
    const v = this.movie.video;
    if (!v || !v.samples.length) throw new Error("no video track");
    this.track = v;
    this.ix = indexFrames(v);
    const span = this.ix.pres.length > 1 ? this.ix.pres[this.ix.pres.length - 1].cts / (this.ix.pres.length - 1) : 1 / 30;
    this.fps = Math.round(100 / span) / 100;
    this.config = { codec: v.codec, codedWidth: v.width, codedHeight: v.height, description: v.description, hardwareAcceleration: "prefer-hardware" as HardwareAcceleration, optimizeForLatency: true };
    let ok = (await VideoDecoder.isConfigSupported(this.config)).supported;
    if (!ok) { this.config.hardwareAcceleration = "no-preference"; ok = (await VideoDecoder.isConfigSupported(this.config)).supported; }
    if (!ok) { this.state = "unsupported"; this.error = `this computer can't decode ${v.codec} here`; return; }
    this.state = "ready";
  }

  /** Presentation index of the frame on screen at `t` (seconds from the clip's first frame). */
  frameIndex(t: number) { return this.ix ? frameAt(this.ix, t) : -1; }
  cacheKey(pi: number) { return `${this.key}#${pi}`; }
  /** The exact frame if decoded, else undefined. */
  get(t: number) { const pi = this.frameIndex(t); return pi < 0 ? undefined : this.cache.get(this.cacheKey(pi)); }
  /** Any decoded frame near t (for showing something instantly while the exact one decodes). */
  nearest(t: number, within = 2) {
    const pi = this.frameIndex(t);
    if (pi < 0) return undefined;
    for (let d = 1; d <= within * this.fps; d++) {
      const a = this.cache.get(this.cacheKey(pi - d)) || this.cache.get(this.cacheKey(pi + d));
      if (a) return a;
    }
    return undefined;
  }

  private gopOf(pi: number) { return this.ix!.gopStart[this.ix!.pres[pi].di]; }
  private gopEnd(start: number) {
    const s = this.track!.samples;
    let i = start + 1;
    while (i < s.length && !s[i].sync) i++;
    return i; // exclusive, decode order
  }

  /** Make sure the GOP containing t is (being) decoded. `lead` > 0 also queues GOPs ahead (playback). */
  want(t: number, direction = 1, lead = 0) {
    if (this.state !== "ready") return;
    const pi = this.frameIndex(t);
    if (pi < 0) return;
    const g = this.gopOf(pi);
    this.wantedGop = g;
    if (!this.cache.has(this.cacheKey(pi))) this.gopsDone.delete(g); // evicted since: decode again
    this.queueGop(g);
    if (lead > 0) {
      // the next GOP(s) in the direction of travel
      let cur = g;
      for (let k = 0; k < lead; k++) {
        if (direction >= 0) { const e = this.gopEnd(cur); if (e >= this.track!.samples.length) break; cur = e; }
        else { if (cur === 0) break; cur = this.ix!.gopStart[cur - 1]; }
        this.queueGop(cur);
      }
    }
  }

  private queueGop(g: number) {
    if (this.gopsDone.has(g) || this.gopsPending.has(g)) return;
    const p = (this.chain = this.chain.then(() => this.decodeGop(g)).catch((e) => { console.warn("decode", this.key, e); }))
      .then(() => { this.gopsPending.delete(g); });
    this.gopsPending.set(g, p as Promise<void>);
  }

  private async decodeGop(g: number) {
    // a scrub can jump far away while GOPs are queued: skip prefetches that are no longer near
    if (g !== this.wantedGop && Math.abs(g - this.wantedGop) > this.fps * 3) return;
    const samples = this.track!.samples;
    const end = this.gopEnd(g);
    let lo = Infinity, hi = 0;
    for (let i = g; i < end; i++) { lo = Math.min(lo, samples[i].offset); hi = Math.max(hi, samples[i].offset + samples[i].size); }
    const bytes = await this.read(lo, hi);
    const t0 = this.ix!.t0;
    const byTs = new Map<number, number>();
    this.ix!.pres.forEach((p, pi) => { if (this.ix!.gopStart[p.di] === g) byTs.set(Math.round((p.cts) * 1e6), pi); });
    const pending: Promise<void>[] = [];
    const dec = this.decoderFor((frame) => {
      const pi = byTs.get(Math.round(frame.timestamp)) ?? byTs.get(Math.round(frame.timestamp) + 1) ?? byTs.get(Math.round(frame.timestamp) - 1);
      if (pi === undefined) { frame.close(); return; }
      pending.push(createImageBitmap(frame).then((bmp) => { this.cache.put(this.cacheKey(pi), bmp); this.stats.framesDecoded++; }).finally(() => frame.close()));
    });
    for (let i = g; i < end; i++) {
      const s = samples[i];
      dec.decode(new EncodedVideoChunk({
        type: i === g ? "key" : "delta",
        timestamp: Math.round((s.cts - t0) * 1e6),
        duration: Math.round(s.duration * 1e6),
        data: bytes.subarray(s.offset - lo, s.offset - lo + s.size),
      }));
    }
    await dec.flush();
    await Promise.all(pending);
    this.gopsDone.add(g);
    this.stats.gopsDecoded++;
    this.onFrames();
  }

  private outputHandler: ((f: VideoFrame) => void) | null = null;
  private decoderFor(onFrame: (f: VideoFrame) => void) {
    this.outputHandler = onFrame;
    if (!this.decoder || this.decoder.state === "closed") {
      this.decoder = new VideoDecoder({ output: (f) => (this.outputHandler ? this.outputHandler(f) : f.close()), error: (e) => { console.warn("decoder error", this.key, e); this.decoder = undefined; } });
    }
    // a GOP starts with a keyframe, so the decoder can (re)start cleanly at each one
    this.decoder.configure(this.config!);
    return this.decoder;
  }

  close() {
    try { this.decoder?.close(); } catch { /* */ }
    this.cache.dropPrefix(`${this.key}#`);
  }
}

// ------------------------------------------------------------------ still images
class StillSource {
  bmp?: Bitmap;
  state: SourceState = "opening";
  constructor(readonly url: string, onReady: () => void) {
    fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((b) => createImageBitmap(b))
      .then((bmp) => { this.bmp = bmp; this.state = "ready"; onReady(); })
      .catch(() => { this.state = "error"; });
  }
  close() { this.bmp?.close(); }
}

// ------------------------------------------------------------------ the engine
export class FrameEngine {
  private cache: FrameCache;
  private sources = new Map<string, VideoSource>();
  private stills = new Map<string, StillSource>();
  private listeners = new Set<() => void>();
  private notifyQueued = false;

  constructor(budgetMB = 768) { this.cache = new FrameCache(budgetMB * MB); }

  /** Called whenever new frames are ready (viewers redraw). */
  onFrames(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private notify = () => {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => { this.notifyQueued = false; for (const l of this.listeners) l(); });
  };

  video(key: string, url: string) {
    let s = this.sources.get(key);
    if (!s || s.url !== url) {
      s?.close();
      s = new VideoSource(key, url, this.cache, this.notify);
      s.ready.then(this.notify);
      this.sources.set(key, s);
    }
    return s;
  }

  still(url: string) {
    let s = this.stills.get(url);
    if (!s) { s = new StillSource(url, this.notify); this.stills.set(url, s); }
    return s;
  }

  /** Drop sources not in `keep` (clips removed from the timeline). */
  retain(keep: Set<string>) {
    for (const [k, s] of this.sources) if (!keep.has(k)) { s.close(); this.sources.delete(k); }
  }

  stats() {
    let gops = 0, frames = 0, bytes = 0;
    for (const s of this.sources.values()) { gops += s.stats.gopsDecoded; frames += s.stats.framesDecoded; bytes += s.stats.bytesRead; }
    return { sources: this.sources.size, cachedFrames: this.cache.count, cacheMB: Math.round(this.cache.bytes / MB), gopsDecoded: gops, framesDecoded: frames, MBread: Math.round(bytes / MB * 10) / 10 };
  }
}

export type { VideoSource, StillSource };
