// A small MP4/MOV demuxer: just enough to decode video frame-exactly with WebCodecs.
//
// It finds the `moov` box wherever it is (proxies put it first; cameras and phones often put it
// at the END of a multi-GB file) using a handful of range reads, then turns the sample tables
// into a flat list: where each frame's bytes are, when it's decoded (dts) and shown (cts), and
// whether it's a keyframe. Works in the browser and in Node (tests compare it with ffprobe).

export type ReadRange = (start: number, end: number) => Promise<Uint8Array>; // end exclusive

export interface Sample { offset: number; size: number; dts: number; cts: number; duration: number; sync: boolean }
export interface Track {
  id: number;
  kind: "video" | "audio" | "other";
  timescale: number;
  duration: number;           // seconds
  codec: string;              // WebCodecs codec string, e.g. "avc1.64001f", "hvc1.2.4.L153.B0", "mp4a.40.2"
  fourcc: string;
  description?: Uint8Array;   // avcC / hvcC payload (VideoDecoder `description`) or AudioSpecificConfig
  width?: number; height?: number;
  sampleRate?: number; channels?: number;
  samples: Sample[];          // in DECODE order
  editStart: number;          // seconds of media time skipped by an edit list (usually 0)
}
export interface Movie { tracks: Track[]; video?: Track; audio?: Track; size: number }

// ------------------------------------------------------------------ box helpers
class Reader {
  b: Uint8Array; p: number; dv: DataView;
  constructor(b: Uint8Array, p = 0) { this.b = b; this.p = p; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.dv.getUint16(this.p); this.p += 2; return v; }
  u24() { const v = (this.b[this.p] << 16) | (this.b[this.p + 1] << 8) | this.b[this.p + 2]; this.p += 3; return v; }
  u32() { const v = this.dv.getUint32(this.p); this.p += 4; return v; }
  i32() { const v = this.dv.getInt32(this.p); this.p += 4; return v; }
  u64() { const hi = this.u32(), lo = this.u32(); return hi * 2 ** 32 + lo; }
  str(n: number) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[this.p++]); return s; }
  skip(n: number) { this.p += n; }
}

interface Box { type: string; start: number; end: number; body: number } // offsets within the buffer

function boxes(b: Uint8Array, from = 0, to = b.length): Box[] {
  const out: Box[] = [];
  const r = new Reader(b, from);
  while (r.p + 8 <= to) {
    const start = r.p;
    let size = r.u32();
    const type = r.str(4);
    let body = r.p;
    if (size === 1) { size = r.u64(); body = r.p; }
    else if (size === 0) size = to - start;
    if (size < 8 || start + size > to) break;
    out.push({ type, start, end: start + size, body });
    r.p = start + size;
  }
  return out;
}
const child = (b: Uint8Array, parent: Box, type: string, skip = 0) => boxes(b, parent.body + skip, parent.end).find((x) => x.type === type);
const children = (b: Uint8Array, parent: Box, skip = 0) => boxes(b, parent.body + skip, parent.end);

// ------------------------------------------------------------------ locating moov
/** Read the top-level box headers until `moov` is found, then read it whole. */
export async function readMoov(read: ReadRange, fileSize: number): Promise<Uint8Array> {
  let pos = 0;
  while (pos + 8 <= fileSize) {
    const h = await read(pos, Math.min(pos + 16, fileSize));
    const r = new Reader(h);
    let size = r.u32();
    const type = r.str(4);
    if (size === 1) size = r.u64();
    else if (size === 0) size = fileSize - pos;
    if (size < 8) throw new Error(`damaged file: bad box at ${pos}`);
    if (type === "moov") return read(pos, pos + size);
    pos += size;
  }
  throw new Error("no moov box (not a finished MP4/MOV, or still being copied)");
}

// ------------------------------------------------------------------ codec strings
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

function avcCodec(avcC: Uint8Array) {
  // avcC: version, profile, compat, level
  return `avc1.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`;
}

function hevcCodec(fourcc: string, h: Uint8Array) {
  // ISO/IEC 14496-15 E.3: hvc1.<profile space+idc>.<compat flags reversed hex>.<tier><level>.<constraint bytes>
  const r = new Reader(h);
  r.skip(1);
  const b = r.u8();
  const space = (b >> 6) & 3, tier = (b >> 5) & 1, idc = b & 31;
  let compat = r.u32();
  let rev = 0;
  for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
  const constraints: number[] = [];
  for (let i = 0; i < 6; i++) constraints.push(r.u8());
  const level = r.u8();
  while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop();
  const parts = [fourcc, `${["", "A", "B", "C"][space]}${idc}`, (rev >>> 0).toString(16), `${tier ? "H" : "L"}${level}`, ...constraints.map((c) => c.toString(16).toUpperCase())];
  return parts.join(".");
}

function esdsAudioConfig(b: Uint8Array, esds: Box) {
  // walk descriptors: ES_Descriptor(3) → DecoderConfig(4) → DecoderSpecificInfo(5)
  const r = new Reader(b, esds.body + 4);
  const len = () => { let n = 0; for (let i = 0; i < 4; i++) { const c = r.u8(); n = (n << 7) | (c & 0x7f); if (!(c & 0x80)) break; } return n; };
  let oti = 0x40;
  let asc: Uint8Array | undefined;
  while (r.p < esds.end) {
    const tag = r.u8();
    const l = len();
    if (tag === 3) { r.skip(2); const flags = r.u8(); if (flags & 0x80) r.skip(2); if (flags & 0x40) r.skip(r.u8()); if (flags & 0x20) r.skip(2); continue; }
    if (tag === 4) { oti = r.u8(); r.skip(12); continue; }
    if (tag === 5) { asc = b.slice(r.p, r.p + l); break; }
    r.skip(l);
  }
  const objType = asc ? asc[0] >> 3 : 2;
  return { codec: oti === 0x40 ? `mp4a.40.${objType}` : `mp4a.${hex2(oti)}`, asc };
}

// ------------------------------------------------------------------ sample tables
function parseTrack(b: Uint8Array, trak: Box): Track | null {
  const tkhd = child(b, trak, "tkhd");
  const mdia = child(b, trak, "mdia");
  if (!tkhd || !mdia) return null;
  const tr = new Reader(b, tkhd.body);
  const tv = tr.u8(); tr.skip(3);
  tr.skip(tv === 1 ? 16 : 8);
  const id = tr.u32();

  const mdhd = child(b, mdia, "mdhd")!;
  const mr = new Reader(b, mdhd.body);
  const mv = mr.u8(); mr.skip(3);
  mr.skip(mv === 1 ? 16 : 8);
  const timescale = mr.u32();
  const mdur = mv === 1 ? mr.u64() : mr.u32();
  const hdlr = child(b, mdia, "hdlr")!;
  const handler = new Reader(b, hdlr.body + 8).str(4);
  const kind = handler === "vide" ? "video" : handler === "soun" ? "audio" : "other";

  // edit list: the first edit's media time (e.g. B-frame delay) is where presentation starts
  let editStart = 0;
  const edts = child(b, trak, "edts");
  const elst = edts && child(b, edts, "elst");
  if (elst) {
    const er = new Reader(b, elst.body);
    const ev = er.u8(); er.skip(3);
    const n = er.u32();
    for (let i = 0; i < n; i++) {
      if (ev === 1) { er.u64(); const mt = er.u64(); er.skip(4); if (mt < 2 ** 53 && mt >= 0) { editStart = mt / timescale; break; } }
      else { er.u32(); const mt = er.i32(); er.skip(4); if (mt >= 0) { editStart = mt / timescale; break; } }
    }
  }

  const minf = child(b, mdia, "minf")!;
  const stbl = child(b, minf, "stbl")!;
  const get = (t: string) => child(b, stbl, t);

  // codec
  const stsd = get("stsd")!;
  const entry = children(b, stsd, 8)[0];
  const fourcc = entry.type;
  const track: Track = { id, kind, timescale, duration: mdur / timescale, codec: fourcc, fourcc, samples: [], editStart };
  if (kind === "video") {
    const er = new Reader(b, entry.body + 24);
    track.width = er.u16(); track.height = er.u16();
    const inner = boxes(b, entry.body + 78, entry.end);
    const avcC = inner.find((x) => x.type === "avcC");
    const hvcC = inner.find((x) => x.type === "hvcC");
    if (avcC) { track.description = b.slice(avcC.body, avcC.end); track.codec = avcCodec(track.description); }
    else if (hvcC) { track.description = b.slice(hvcC.body, hvcC.end); track.codec = hevcCodec(fourcc, track.description); }
  } else if (kind === "audio") {
    const ar = new Reader(b, entry.body + 8);
    const ver = ar.u16(); ar.skip(6);
    track.channels = ar.u16(); ar.skip(6);
    track.sampleRate = ar.u32() >>> 16;
    const innerStart = entry.body + 28 + (ver === 1 ? 16 : ver === 2 ? 36 : 0);
    const esds = boxes(b, innerStart, entry.end).find((x) => x.type === "esds")
      || boxes(b, innerStart, entry.end).flatMap((x) => (x.type === "wave" ? boxes(b, x.body, x.end) : [])).find((x) => x.type === "esds");
    if (esds) { const a = esdsAudioConfig(b, esds); track.codec = a.codec; track.description = a.asc; }
  }

  // sizes
  const stsz = get("stsz") || get("stz2");
  const sr = new Reader(b, stsz!.body + 4);
  const fixed = sr.u32();
  const count = sr.u32();
  const sizes = new Array<number>(count);
  for (let i = 0; i < count; i++) sizes[i] = fixed || sr.u32();

  // chunk offsets + sample-to-chunk → sample offsets
  const stco = get("stco"), co64 = get("co64");
  const cr = new Reader(b, (stco || co64)!.body + 4);
  const nChunks = cr.u32();
  const chunkOff = new Array<number>(nChunks);
  for (let i = 0; i < nChunks; i++) chunkOff[i] = co64 ? cr.u64() : cr.u32();
  const stsc = new Reader(b, get("stsc")!.body + 4);
  const nStsc = stsc.u32();
  const runs: { first: number; per: number }[] = [];
  for (let i = 0; i < nStsc; i++) { const first = stsc.u32(); const per = stsc.u32(); stsc.skip(4); runs.push({ first, per }); }
  const offsets = new Array<number>(count);
  let s = 0;
  for (let ri = 0; ri < runs.length; ri++) {
    const lastChunk = ri + 1 < runs.length ? runs[ri + 1].first - 1 : nChunks;
    for (let c = runs[ri].first; c <= lastChunk && s < count; c++) {
      let off = chunkOff[c - 1];
      for (let k = 0; k < runs[ri].per && s < count; k++) { offsets[s] = off; off += sizes[s]; s++; }
    }
  }

  // decode times
  const stts = new Reader(b, get("stts")!.body + 4);
  const nStts = stts.u32();
  const dts = new Array<number>(count);
  const durs = new Array<number>(count);
  let t = 0, i = 0;
  for (let e = 0; e < nStts; e++) {
    const n = stts.u32(), d = stts.u32();
    for (let k = 0; k < n && i < count; k++, i++) { dts[i] = t; durs[i] = d; t += d; }
  }
  // composition offsets (B-frames)
  const ctsOff = new Array<number>(count).fill(0);
  const ctts = get("ctts");
  if (ctts) {
    const cr2 = new Reader(b, ctts.body);
    const cv = cr2.u8(); cr2.skip(3);
    const n = cr2.u32();
    let j = 0;
    for (let e = 0; e < n; e++) {
      const c = cr2.u32(); const o = cv === 1 ? cr2.i32() : cr2.u32() | 0;
      for (let k = 0; k < c && j < count; k++, j++) ctsOff[j] = o;
    }
  }
  // keyframes (no stss = every sample is a keyframe, e.g. audio)
  const sync = new Array<boolean>(count).fill(!get("stss"));
  const stss = get("stss");
  if (stss) {
    const r3 = new Reader(b, stss.body + 4);
    const n = r3.u32();
    for (let k = 0; k < n; k++) { const idx = r3.u32() - 1; if (idx < count) sync[idx] = true; }
  }
  for (let k = 0; k < count; k++) {
    track.samples.push({ offset: offsets[k], size: sizes[k], dts: dts[k] / timescale, cts: (dts[k] + ctsOff[k]) / timescale, duration: durs[k] / timescale, sync: sync[k] });
  }
  return track;
}

export function parseMovie(moov: Uint8Array, size: number): Movie {
  const root = boxes(moov)[0];
  if (!root || root.type !== "moov") throw new Error("not a moov box");
  const tracks = children(moov, root).filter((x) => x.type === "trak").map((t) => parseTrack(moov, t)).filter(Boolean) as Track[];
  return { tracks, video: tracks.find((t) => t.kind === "video"), audio: tracks.find((t) => t.kind === "audio"), size };
}

export async function openMovie(read: ReadRange, size: number) {
  return parseMovie(await readMoov(read, size), size);
}

// ------------------------------------------------------------------ frame lookup
export interface FrameIndex {
  /** Samples sorted by presentation time (with their decode-order index). */
  pres: { cts: number; dur: number; di: number }[];
  /** For each decode index, the decode index of its GOP's keyframe. */
  gopStart: Int32Array;
  t0: number; // presentation time of the first frame (edit list / B-frame delay), subtracted so frame 0 is at 0
}

export function indexFrames(track: Track): FrameIndex {
  const s = track.samples;
  const gopStart = new Int32Array(s.length);
  let k = 0;
  for (let i = 0; i < s.length; i++) { if (s[i].sync) k = i; gopStart[i] = k; }
  const pres = s.map((x, di) => ({ cts: x.cts, dur: x.duration, di })).sort((a, b) => a.cts - b.cts);
  const t0 = pres.length ? pres[0].cts : 0;
  for (const p of pres) p.cts -= t0;
  return { pres, gopStart, t0 };
}

/** The frame showing at time t (seconds from the first frame): index into `pres`. */
export function frameAt(ix: FrameIndex, t: number): number {
  const p = ix.pres;
  if (!p.length) return -1;
  let lo = 0, hi = p.length - 1;
  const tt = t + 1e-6;
  if (tt <= p[0].cts) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p[mid].cts <= tt) lo = mid; else hi = mid - 1;
  }
  return lo;
}
