// The media engine: everything that happens to footage after import, off the main path.
//
//  - A background queue, at most 2 ffmpeg jobs at once, at low CPU priority:
//      thumbnail → proxy → filmstrip (from the proxy) → waveform, clips on the timeline first.
//  - Proxies: 960×540 (540×960 vertical) H.264, a keyframe every second, AAC — made with the
//    Mac's hardware encoder (h264_videotoolbox) when it works, otherwise libx264.
//    10-bit is converted to 8-bit; HDR (HLG/PQ) is tone-mapped to SDR. Preview only.
//  - Everything is cached by content fingerprint in project/.cache/, so no file is ever
//    processed twice — even after it's moved or its drive is renamed.
//  - A failed job marks that clip only (with the reason and a Retry). Nothing else stops.
//  - Offline detection every 2 s; a drive that comes back under any name is reconnected.
import fs from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { probe, type ProbeInfo } from "./probe";
import { fingerprint } from "./fingerprint";
import { capabilities, hdrToSdr, type Caps } from "./caps";
import { run } from "./run";
import { volumeOf, mounted, type VolumeRef } from "./volumes";
import type { Media } from "../../shared/model";

export type JobKind = "thumb" | "proxy" | "strip" | "wave" | "still";
export type AssetState = "ready" | "queued" | "running" | "error" | "n/a" | "waiting";
export interface AssetStatus { state: AssetState; progress?: number; error?: string; encoder?: string }
export interface MediaStatus {
  online: boolean;
  thumb: AssetStatus; proxy: AssetStatus; strip: AssetStatus; wave: AssetStatus; still: AssetStatus;
}

interface Job { key: string; kind: JobKind; fp: string; mediaId: string; src: string; media: Media; priority: number; seq: number; progress: number; proc?: ChildProcess }
interface IndexFile { files: Record<string, { size: number; mtimeMs: number; fp: string }>; errors: Record<string, string>; encoders: Record<string, string> }

export const MAX_JOBS = 2;
const EXT: Record<JobKind, string> = { thumb: "jpg", proxy: "mp4", strip: "jpg", wave: "png", still: "jpg" };
const DIR: Record<JobKind, string> = { thumb: "thumbs", proxy: "proxies", strip: "strips", wave: "waves", still: "stills" };
const BASE_PRIORITY: Record<JobKind, number> = { thumb: 0, still: 1, proxy: 1, strip: 2, wave: 3 };
const STRIP_FRAMES = 16;

export class MediaEngine {
  readonly cache: string;
  private index: IndexFile = { files: {}, errors: {}, encoders: {} };
  private indexTimer?: NodeJS.Timeout;
  private queue: Job[] = [];
  private running = new Map<string, Job>();
  private seq = 0;
  private online = new Map<string, boolean>(); // mediaId → online
  private onTimeline = new Set<string>();
  private caps: Caps | null = null;
  private changed = new Set<string>();      // mediaIds whose status changed (for throttled broadcast)
  private flushTimer?: NodeJS.Timeout;
  private paused = false;
  stats = { maxConcurrent: 0, jobsRun: 0, jobsSkipped: 0 };

  constructor(projectDir: string, private emit: (statuses: Record<string, MediaStatus>) => void, private log: (...a: unknown[]) => void = () => {}) {
    this.cache = path.join(projectDir, ".cache");
    for (const d of Object.values(DIR)) fs.mkdirSync(path.join(this.cache, d), { recursive: true });
    try { this.index = { ...this.index, ...JSON.parse(fs.readFileSync(path.join(this.cache, "index.json"), "utf8")) }; } catch { /* fresh cache */ }
    capabilities().then((c) => { this.caps = c; this.log(`encoders: proxy ${c.h264HW ? "h264_videotoolbox (hardware)" : "libx264 (software)"}${c.tonemap ? ", HDR tone-mapping on" : ""}`); this.pump(); });
  }

  // ------------------------------------------------------------------ describe (import)
  /** Facts for a new media entry. Throws (with a readable reason) if the file can't be used. */
  async describe(file: string): Promise<Omit<Media, "id">> {
    const info: ProbeInfo = await probe(file);
    const fp = this.fingerprintOf(file);
    const vol = volumeOf(file);
    const e: Record<string, unknown> = { path: file, name: path.basename(file), ...info, fingerprint: fp };
    if (vol) e.volume = vol;
    if (info.type === "audio") { delete e.width; delete e.height; }
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    return e as Omit<Media, "id">;
  }

  /** Fingerprint, cached by path + size + mtime so a big file is only read once. */
  fingerprintOf(file: string) {
    const st = fs.statSync(file);
    const hit = this.index.files[file];
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.fp;
    const fp = fingerprint(file);
    this.index.files[file] = { size: st.size, mtimeMs: st.mtimeMs, fp };
    this.saveIndexSoon();
    return fp;
  }

  // ------------------------------------------------------------------ assets
  assetPath(fp: string, kind: JobKind) { return path.join(this.cache, DIR[kind], `${fp}.${EXT[kind]}`); }
  has(m: Media, kind: JobKind) { return !!m.fingerprint && fs.existsSync(this.assetPath(m.fingerprint, kind)); }
  /** The asset file, or null if it isn't made yet. */
  asset(m: Media, kind: JobKind) { return m.fingerprint && fs.existsSync(this.assetPath(m.fingerprint, kind)) ? this.assetPath(m.fingerprint, kind) : null; }

  private wants(m: Media): JobKind[] {
    if (m.type === "image") return ["thumb", "still"]; // still: full-size JPEG (browsers can't show HEIC/TIFF)
    if (m.type === "audio") return ["wave"];
    return m.hasAudio ? ["thumb", "proxy", "strip", "wave"] : ["thumb", "proxy", "strip"];
  }

  status(m: Media): MediaStatus {
    const one = (kind: JobKind): AssetStatus => {
      if (!this.wants(m).includes(kind)) return { state: "n/a" };
      const fp = m.fingerprint || "";
      if (fp && fs.existsSync(this.assetPath(fp, kind))) return { state: "ready", encoder: kind === "proxy" ? this.index.encoders[fp] : undefined };
      const key = `${fp}:${kind}`;
      const r = this.running.get(key);
      if (r) return { state: "running", progress: r.progress };
      if (this.queue.some((j) => j.key === key)) return { state: kind === "strip" && !this.has(m, "proxy") ? "waiting" : "queued" };
      const err = this.index.errors[key];
      if (err) return { state: "error", error: err };
      return { state: "queued" };
    };
    return { online: this.online.get(m.id) ?? true, thumb: one("thumb"), proxy: one("proxy"), strip: one("strip"), wave: one("wave"), still: one("still") };
  }

  // ------------------------------------------------------------------ queue
  /** Make sure every missing asset of every media is queued. Cheap to call often. */
  sync(media: Media[], onTimeline: Set<string>) {
    this.onTimeline = onTimeline;
    const live = new Set<string>();
    for (const m of media) {
      if (!m.fingerprint) continue;
      for (const kind of this.wants(m)) {
        const key = `${m.fingerprint}:${kind}`;
        live.add(key);
        if (fs.existsSync(this.assetPath(m.fingerprint, kind))) continue;
        if (this.index.errors[key] || this.running.has(key)) continue;
        const existing = this.queue.find((j) => j.key === key);
        const priority = BASE_PRIORITY[kind] + (onTimeline.has(m.id) ? 0 : 10);
        if (existing) { existing.priority = priority; existing.media = m; existing.src = m.path; continue; }
        if (this.online.get(m.id) === false) continue;
        this.queue.push({ key, kind, fp: m.fingerprint, mediaId: m.id, src: m.path, media: m, priority, seq: this.seq++, progress: 0 });
        this.changed.add(m.id);
      }
    }
    // drop work for media that's gone from the project
    this.queue = this.queue.filter((j) => live.has(j.key));
    this.pump();
    this.flushSoon(media);
  }

  retry(m: Media) {
    for (const kind of this.wants(m)) delete this.index.errors[`${m.fingerprint}:${kind}`];
    this.saveIndexSoon();
  }

  private pump() {
    if (!this.caps || this.paused) return;
    while (this.running.size < MAX_JOBS) {
      // a filmstrip is made from the proxy, so it waits for it
      const ready = this.queue.filter((j) => j.kind !== "strip" || fs.existsSync(this.assetPath(j.fp, "proxy")));
      if (!ready.length) return;
      ready.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      const job = ready[0];
      this.queue = this.queue.filter((j) => j !== job);
      if (fs.existsSync(this.assetPath(job.fp, job.kind))) { this.stats.jobsSkipped++; continue; }
      this.running.set(job.key, job);
      this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.running.size);
      this.changed.add(job.mediaId);
      this.execute(job)
        .then(() => { delete this.index.errors[job.key]; })
        .catch((e) => {
          const msg = String(e?.message || e).split("\n")[0];
          if (!fs.existsSync(job.src)) { this.online.set(job.mediaId, false); this.log(`${job.media.name}: went offline during ${job.kind}`); }
          else { this.index.errors[job.key] = msg; this.log(`${job.kind} failed for ${job.media.name}: ${msg}`); }
          this.saveIndexSoon();
        })
        .finally(() => {
          this.running.delete(job.key);
          this.stats.jobsRun++;
          this.changed.add(job.mediaId);
          this.flushSoon();
          this.pump();
        });
    }
  }

  pause(p: boolean) { this.paused = p; if (!p) this.pump(); }

  private lastMedia: Media[] = [];
  private flushSoon(media?: Media[]) {
    if (media) this.lastMedia = media;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      const out: Record<string, MediaStatus> = {};
      for (const m of this.lastMedia) if (this.changed.has(m.id)) out[m.id] = this.status(m);
      this.changed.clear();
      if (Object.keys(out).length) this.emit(out);
    }, 250);
  }

  // ------------------------------------------------------------------ jobs
  private progress(job: Job, seconds: number, total: number) {
    const p = Math.max(0, Math.min(0.999, seconds / Math.max(total, 0.01)));
    if (p - job.progress >= 0.01) { job.progress = p; this.changed.add(job.mediaId); this.flushSoon(); }
  }

  private async execute(job: Job) {
    const out = this.assetPath(job.fp, job.kind);
    const tmp = `${out}.part.${EXT[job.kind]}`;
    const m = job.media;
    const tonemap = m.hdr && this.caps?.tonemap ? hdrToSdr(m.hdr) : "";
    const ff = (args: string[], onOut?: (s: string) => void) =>
      run("ffmpeg", ["-nostdin", "-hide_banner", "-v", "error", "-y", ...args], { nice: true, onStdout: onOut, onSpawn: (p) => (job.proc = p) });
    try {
      if (job.kind === "thumb") {
        const at = m.type === "video" ? Math.min(1, (m.duration || 2) * 0.1) : 0;
        await ff([...(m.type === "video" ? ["-ss", String(at)] : []), "-i", job.src, "-frames:v", "1", "-vf", `${tonemap}scale=-2:180,format=yuvj420p`, "-q:v", "4", tmp]);
      } else if (job.kind === "still") {
        await ff(["-i", job.src, "-frames:v", "1", "-vf", `${tonemap}scale='min(1920,iw)':-2,format=yuvj420p`, "-q:v", "3", tmp]);
      } else if (job.kind === "wave") {
        await ff(["-i", job.src, "-filter_complex", "[0:a:0]aformat=channel_layouts=mono,showwavespic=s=2000x120:colors=#9fb3a8[w]", "-map", "[w]", "-frames:v", "1", tmp]);
      } else if (job.kind === "strip") {
        // keyframes only (one per second in the proxy) → fast even for long clips
        const proxy = this.assetPath(job.fp, "proxy");
        const dur = m.duration || 1;
        // one tile per keyframe at most (the proxy has one per second); sample slightly faster
        // than needed so the last tile is never left empty
        const n = Math.max(1, Math.min(STRIP_FRAMES, Math.floor(dur)));
        const rate = (n / Math.max(dur - 1, 0.5)).toFixed(5);
        // ffmpeg can "succeed" without writing anything on very short clips, so check and fall back:
        // keyframes only (fast) → every frame → a single frame
        await ff(["-skip_frame", "nokey", "-i", proxy, "-vf", `fps=${rate},scale=-2:72,tile=${n}x1:padding=0`, "-frames:v", "1", "-q:v", "5", tmp]).catch(() => {});
        if (!fs.existsSync(tmp)) await ff(["-i", proxy, "-vf", `fps=${rate},scale=-2:72,tile=${n}x1:padding=0`, "-frames:v", "1", "-q:v", "5", tmp]).catch(() => {});
        if (!fs.existsSync(tmp)) await ff(["-i", proxy, "-vf", "scale=-2:72", "-frames:v", "1", "-q:v", "5", tmp]);
      } else {
        await this.makeProxy(job, tmp, tonemap);
      }
      if (!fs.existsSync(tmp)) throw new Error(`ffmpeg finished but wrote no ${job.kind}`);
      fs.renameSync(tmp, out);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* */ }
      throw e;
    }
  }

  /** Try hardware encode+decode, then hardware encode only, then software. */
  private async makeProxy(job: Job, tmp: string, tonemap: string) {
    const m = job.media;
    const fps = Math.min(Math.round(m.fps || 30), 60);
    const landscape = (m.width || 16) >= (m.height || 9);
    const [bw, bh] = landscape ? [960, 540] : [540, 960];
    const vf = `${tonemap}scale=w=${bw}:h=${bh}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`;
    const common = ["-map", "0:v:0", "-map", "0:a:0?", "-vf", vf, "-fps_mode", "cfr", "-r", String(fps),
      "-force_key_frames", "expr:gte(t,n_forced*1)", "-g", String(fps),
      // tone-mapped/converted to SDR Rec.709: say so, or players may treat it as HDR again
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats"];
    const hw = ["-c:v", "h264_videotoolbox", "-b:v", "4M", "-maxrate", "6M", "-bufsize", "8M", "-allow_sw", "1", "-realtime", "0"];
    const sw = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-keyint_min", String(fps), "-sc_threshold", "0", "-pix_fmt", "yuv420p"];
    const attempts: { label: string; args: string[] }[] = [];
    if (this.caps?.h264HW) {
      if (this.caps.hwDecode) attempts.push({ label: "h264_videotoolbox + hw decode", args: ["-hwaccel", "videotoolbox", "-i", job.src, ...hw, ...common, tmp] });
      attempts.push({ label: "h264_videotoolbox", args: ["-i", job.src, ...hw, ...common, tmp] });
    }
    attempts.push({ label: "libx264", args: ["-i", job.src, ...sw, ...common, tmp] });
    let last: unknown;
    for (const a of attempts) {
      job.progress = 0;
      try {
        await run("ffmpeg", ["-nostdin", "-hide_banner", "-v", "error", "-y", ...a.args], {
          nice: true, onSpawn: (p) => (job.proc = p),
          onStdout: (s) => { const t = /out_time_us=(\d+)/.exec(s); if (t) this.progress(job, Number(t[1]) / 1e6, m.duration || 1); },
        });
        this.index.encoders[job.fp] = a.label;
        this.saveIndexSoon();
        return;
      } catch (e) {
        last = e;
        if (!fs.existsSync(job.src)) throw e; // offline: no point trying other encoders
        this.log(`proxy for ${m.name} with ${a.label} failed (${String((e as Error).message).slice(0, 120)}); trying the next way`);
      }
    }
    throw last;
  }

  // ------------------------------------------------------------------ online / offline
  /**
   * Check every media file. Returns relinks to apply (a drive back under a new mount name)
   * and whether anything changed state.
   */
  checkOnline(media: Media[]): { relinks: { id: string; path: string }[]; changed: boolean } {
    const relinks: { id: string; path: string }[] = [];
    let changed = false;
    let mounts: Map<string, string> | null = null;
    for (const m of media) {
      let ok = false;
      try { ok = fs.statSync(m.path).isFile(); } catch { ok = false; }
      if (!ok && m.volume) {
        mounts ??= mounted();
        const mount = mounts.get(m.volume.uuid);
        const candidate = mount ? path.join(mount, m.volume.rel) : null;
        if (candidate && candidate !== m.path && fs.existsSync(candidate)) {
          try {
            const st = fs.statSync(candidate);
            if (m.size === undefined || st.size === m.size) { relinks.push({ id: m.id, path: candidate }); ok = true; }
          } catch { /* */ }
        }
      }
      if (this.online.get(m.id) !== ok) {
        const was = this.online.get(m.id);
        this.online.set(m.id, ok);
        this.changed.add(m.id);
        if (was !== undefined) { changed = true; this.log(`${m.name} is ${ok ? "back online" : "offline"}`); }
        if (!ok) for (const [key, j] of this.running) if (j.mediaId === m.id) { j.proc?.kill("SIGKILL"); this.running.delete(key); }
      }
    }
    if (changed) this.flushSoon(media);
    return { relinks, changed };
  }

  isOnline(id: string) { return this.online.get(id) ?? true; }

  /** Check a replacement file is the same footage (same fingerprint) before relinking. */
  sameFile(m: Media, candidate: string) {
    try { return !m.fingerprint || this.fingerprintOf(candidate) === m.fingerprint; } catch { return false; }
  }

  // ------------------------------------------------------------------ index
  private saveIndexSoon() {
    clearTimeout(this.indexTimer);
    this.indexTimer = setTimeout(() => {
      const f = path.join(this.cache, "index.json");
      fs.writeFileSync(f + ".tmp", JSON.stringify(this.index));
      fs.renameSync(f + ".tmp", f);
    }, 300);
  }

  queueInfo() {
    return { running: this.running.size, queued: this.queue.length, max: MAX_JOBS, encoder: this.caps ? (this.caps.h264HW ? "hardware" : "software") : "checking", ...this.stats };
  }

  stopAll() { for (const j of this.running.values()) j.proc?.kill("SIGKILL"); }
}

export type { VolumeRef };
