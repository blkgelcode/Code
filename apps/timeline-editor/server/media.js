// Media on disk: reading metadata, and the three derived files each clip gets in
// project/.cache: a thumbnail, a waveform and a 960x540 proxy.
//
// Nothing here reads a media file into memory. ffprobe/ffmpeg stream from disk,
// the waveform is computed from a small PCM stream as it arrives, and outputs are
// written to *.part files and renamed only when complete, so a crash or an
// unplugged drive never leaves a half-written cache file behind.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { MEDIA_DIR, CACHE_DIR } from "./store.js";
import { nextId, round } from "../src/lib/model.js";
import { decodeArgs, encodeArgs } from "./hw.js";

const run = promisify(execFile);

const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".mxf", ".lrf"]);
const AUDIO = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".caf"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
/** Audio the browser plays as-is; anything else gets an AAC proxy. */
const BROWSER_AUDIO = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"]);

export const PROXY = { width: 960, height: 540, keyframeSec: 1 };
export const WAVE_RATE = 50; // peaks per second

export function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (IMAGE.has(ext)) return "image";
  return null;
}

/** Absolute path of a media entry: `file` is absolute, or relative to MEDIA_DIR. */
export const resolvePath = (m) => (path.isAbsolute(m.file) ? m.file : path.join(MEDIA_DIR, m.file));

/** How a newly imported file is stored: relative inside MEDIA_DIR (portable), absolute elsewhere. */
export function storedPath(abs) {
  const rel = path.relative(MEDIA_DIR, abs);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : abs;
}

/** Every importable file under a folder (skipping hidden files, packages and caches). */
export function scanDir(dir, limit = 5000) {
  const out = [];
  const walk = (d) => {
    let names;
    try {
      names = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (out.length >= limit) return;
      if (name.startsWith(".") || name.startsWith("_") || name.endsWith(".app") || name.endsWith(".fcpbundle")) continue;
      const full = path.join(d, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (kindOf(name) && st.size > 0) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// ---- metadata -----------------------------------------------------------------------------

export async function probe(abs) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", abs], { timeout: 30000 });
  const info = JSON.parse(stdout);
  const v = info.streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const a = info.streams.find((s) => s.codec_type === "audio");
  const kind = kindOf(abs);
  const st = fs.statSync(abs);
  const entry = { kind, size: st.size };
  if (kind !== "image") {
    entry.duration = round(Number(info.format.duration || v?.duration || a?.duration || 0));
    if (!entry.duration) throw new Error("no duration found (is the file complete?)");
  }
  if (kind === "video" && !v) throw new Error("no video stream");
  if (kind === "audio" && !a) throw new Error("no audio stream");
  if (v) {
    let w = v.width;
    let h = v.height;
    const rot = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
    if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
    Object.assign(entry, { width: w, height: h });
    if (kind === "video") {
      const rate = (v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate) || "0/1";
      const [n, d] = rate.split("/").map(Number);
      if (d) entry.fps = round(n / d);
      entry.codec = v.codec_name;
      const bits = Number(v.bits_per_raw_sample) || (/(10|12)(le|be)?$/.test(v.pix_fmt || "") ? Number(/(10|12)/.exec(v.pix_fmt)[1]) : 8);
      entry.bitDepth = bits;
      if (v.color_transfer && /arib-std-b67|smpte2084/.test(v.color_transfer)) entry.hdr = v.color_transfer === "smpte2084" ? "PQ" : "HLG";
      if (rot) entry.rotation = rot;
    }
  }
  entry.hasAudio = Boolean(a);
  if (a) entry.audioCodec = a.codec_name;
  return entry;
}

// ---- cache ----------------------------------------------------------------------------------

/**
 * Cache key from the file's name, size and modified time (not its folder), so a
 * drive that comes back under a different mount point reuses its cache.
 */
export function cacheKey(abs, st = fs.statSync(abs)) {
  return crypto.createHash("sha1").update(`${path.basename(abs)}|${st.size}|${Math.round(st.mtimeMs)}`).digest("hex").slice(0, 20);
}

export const cachePaths = (key, kind) => ({
  thumb: path.join(CACHE_DIR, "thumbs", `${key}.jpg`),
  wave: path.join(CACHE_DIR, "waves", `${key}.json`),
  proxy: path.join(CACHE_DIR, "proxies", `${key}.${kind === "audio" ? "m4a" : "mp4"}`),
});

/** Which derived files a media entry needs. */
export function needs(m, abs) {
  return {
    thumb: m.kind === "video" || m.kind === "image",
    wave: m.kind === "audio" || (m.kind === "video" && m.hasAudio),
    proxy: m.kind === "video" || (m.kind === "audio" && !BROWSER_AUDIO.has(path.extname(abs).toLowerCase())),
  };
}

/** Remove half-written files left by a crash or an unplugged drive. */
export function cleanPartials() {
  for (const sub of ["thumbs", "waves", "proxies"]) {
    const d = path.join(CACHE_DIR, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.includes(".part")) fs.rmSync(path.join(d, f), { force: true });
  }
}

function ffmpegJob(args, { duration, onProgress, cancelCheck }) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-y", "-progress", "pipe:1", ...args]);
    let err = "";
    p.stdout.on("data", (buf) => {
      const m = /out_time_us=(\d+)/.exec(buf.toString());
      if (m && duration) onProgress?.(Math.min(0.99, Number(m[1]) / 1e6 / duration));
      if (cancelCheck?.()) p.kill("SIGKILL");
    });
    p.stderr.on("data", (b) => (err = (err + b).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split("\n").pop() || `ffmpeg exited with ${code}`))));
  });
}

async function finish(tmp, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.renameSync(tmp, out);
}

export async function makeThumb(m, abs, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.part.jpg`;
  const at = m.kind === "video" ? Math.min(1, (m.duration || 0) / 3) : 0;
  // -ss before -i: fast keyframe seek, no decoding the whole file
  await ffmpegJob(["-ss", String(at), "-i", abs, "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=320:-2,format=yuvj420p", "-q:v", "4", tmp], {});
  await finish(tmp, out);
}

/** Peaks (0-255) at WAVE_RATE per second, from an 8 kHz mono stream read as it arrives. */
export function makeWave(m, abs, out, onProgress) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const SR = 8000;
  const per = SR / WAVE_RATE;
  const peaks = [];
  let count = 0;
  let max = 0;
  let carry = null;
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-i", abs, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "pipe:1"]);
    let err = "";
    p.stderr.on("data", (b) => (err = (err + b).slice(-2000)));
    p.stdout.on("data", (chunk) => {
      let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      carry = usable < buf.length ? buf.subarray(usable) : null;
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > max) max = v;
        if (++count >= per) {
          peaks.push(Math.min(255, Math.round((max / 32768) * 255)));
          count = 0;
          max = 0;
        }
      }
      if (m.duration) onProgress?.(Math.min(0.99, peaks.length / WAVE_RATE / m.duration));
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim().split("\n").pop() || "waveform failed"));
      const tmp = `${out}.part`;
      fs.writeFileSync(tmp, JSON.stringify({ rate: WAVE_RATE, peaks }));
      finish(tmp, out).then(resolve, reject);
    });
  });
}

/**
 * The proxy the browser plays. Video: 960x540 (540x960 for vertical) H.264 with a
 * keyframe every second, so scrubbing is instant. Audio that browsers can't play:
 * AAC. If hardware encoding fails on a file, it's retried in software once.
 */
export async function makeProxy(m, abs, out, hw, onProgress) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.part${path.extname(out)}`;
  try {
    if (m.kind === "audio") {
      await ffmpegJob(["-i", abs, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "160k", tmp], { duration: m.duration, onProgress });
    } else {
      const vertical = (m.height || 0) > (m.width || 0);
      const [W, H] = vertical ? [PROXY.height, PROXY.width] : [PROXY.width, PROXY.height];
      const fps = Math.min(60, m.fps || 30);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`;
      const build = (h) => [
        ...decodeArgs(h), "-i", abs,
        "-map", "0:v:0", "-map", "0:a:0?", "-vf", vf, "-r", String(fps),
        ...encodeArgs(h, { quality: "proxy", width: W, height: H, fps, keyframeSec: PROXY.keyframeSec }),
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", tmp,
      ];
      try {
        await ffmpegJob(build(hw), { duration: m.duration, onProgress });
      } catch (e) {
        if (!hw || (hw.encoder === "libx264" && !hw.decode)) throw e;
        fs.rmSync(tmp, { force: true });
        await ffmpegJob(build({ encoder: "libx264", decode: null }), { duration: m.duration, onProgress });
      }
    }
    await finish(tmp, out);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// ---- import ---------------------------------------------------------------------------------

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

/**
 * Add files and folders (absolute paths) to the media list. Folders are scanned
 * recursively. Files already in the list are skipped. Only ffprobe runs here; the
 * thumbnails, waveforms and proxies are made later by the background queue.
 */
export async function importPaths(timeline, paths) {
  const next = JSON.parse(JSON.stringify(timeline));
  const known = new Set(next.media.map((m) => resolvePath(m)));
  const files = [];
  for (const p of paths) {
    const abs = path.resolve(p);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      files.push({ abs, missing: true });
      continue;
    }
    if (st.isDirectory()) scanDir(abs).forEach((f) => files.push({ abs: f }));
    else files.push({ abs });
  }
  const seen = new Set();
  const todo = files.filter((f) => {
    if (seen.has(f.abs)) return false;
    seen.add(f.abs);
    return !known.has(f.abs);
  });
  const skipped = files.length - todo.length;
  const results = await mapLimit(todo, 6, async (f) => {
    if (f.missing) return { file: f.abs, error: "not found" };
    if (!kindOf(f.abs)) return { file: f.abs, error: "not a video, audio or image file" };
    try {
      return { file: f.abs, info: await probe(f.abs) };
    } catch (e) {
      const why = (e.stderr || "").trim().split("\n").pop() || String(e.message).split("\n")[0];
      return { file: f.abs, error: `can't read it (${why.replace(/^.*?: /, "")})` };
    }
  });
  const added = [];
  const failed = [];
  for (const r of results) {
    if (r.error) {
      failed.push({ file: r.file, error: r.error });
      continue;
    }
    const entry = { id: nextId(next, "m"), file: storedPath(r.file), ...r.info };
    next.media.push(entry);
    added.push(entry);
  }
  // first footage into an empty project sets the project's frame size and rate
  const noClips = next.tracks.every((t) => t.clips.length === 0);
  const firstVideo = added.find((m) => m.kind === "video");
  if (noClips && timeline.media.length === 0 && firstVideo) {
    next.settings.width = firstVideo.width;
    next.settings.height = firstVideo.height;
    next.settings.fps = firstVideo.fps || 30;
  }
  return { timeline: next, added, failed, skipped };
}
