// Media import: scan media/, read each file with ffprobe, make a thumbnail, and
// make a small H.264 preview proxy for the browser. The original files are never
// changed; exports always use the originals.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { MEDIA_DIR, CACHE_DIR } from "./store.js";
import { nextId, round } from "../src/lib/model.js";

const run = promisify(execFile);

const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts"]);
const AUDIO = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (IMAGE.has(ext)) return "image";
  return null;
}

/** Every importable file under media/, as paths relative to it. */
export function scanMedia(dir = MEDIA_DIR, base = MEDIA_DIR) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...scanMedia(full, base));
    else if (kindOf(name)) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

export async function probe(file) {
  const full = path.join(MEDIA_DIR, file);
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", full]);
  const info = JSON.parse(stdout);
  const v = info.streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const a = info.streams.find((s) => s.codec_type === "audio");
  const kind = kindOf(file);
  const entry = { file, kind };
  if (kind !== "image") entry.duration = round(Number(info.format.duration || v?.duration || a?.duration || 0));
  if (v) {
    let w = v.width;
    let h = v.height;
    const rot = Number(v.tags?.rotate ?? v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
    if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
    entry.width = w;
    entry.height = h;
    if (kind === "video" && v.avg_frame_rate && v.avg_frame_rate !== "0/0") {
      const [n, d] = v.avg_frame_rate.split("/").map(Number);
      if (d) entry.fps = round(n / d);
    }
  }
  entry.hasAudio = Boolean(a);
  return entry;
}

// ---- cache: thumbnails and preview proxies, keyed by file + size + mtime ---------------------

function cacheKey(file) {
  const st = fs.statSync(path.join(MEDIA_DIR, file));
  return crypto.createHash("sha1").update(`${file}|${st.size}|${st.mtimeMs}`).digest("hex").slice(0, 16);
}

export const thumbPath = (file) => path.join(CACHE_DIR, "thumbs", `${cacheKey(file)}.jpg`);
export const proxyPath = (file) => path.join(CACHE_DIR, "proxies", `${cacheKey(file)}.mp4`);

export async function makeThumb(entry) {
  const out = thumbPath(entry.file);
  if (fs.existsSync(out) || entry.kind === "audio") return;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const at = entry.kind === "video" ? Math.min(1, (entry.duration || 0) / 2) : 0;
  await run("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", path.join(MEDIA_DIR, entry.file),
    "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", out]);
}

/** Make a 720p H.264/AAC proxy the browser can always play. Resolves when done. */
export function makeProxy(entry, onProgress = () => {}) {
  const out = proxyPath(entry.file);
  if (entry.kind !== "video" || fs.existsSync(out)) return Promise.resolve(false);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.part.mp4`;
  const args = ["-v", "error", "-y", "-progress", "pipe:1", "-i", path.join(MEDIA_DIR, entry.file),
    "-vf", "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-g", "15",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp];
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    p.stdout.on("data", (buf) => {
      const m = /out_time_us=(\d+)/.exec(buf.toString());
      if (m && entry.duration) onProgress(Math.min(1, Number(m[1]) / 1e6 / entry.duration));
    });
    let err = "";
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => {
      if (code === 0) {
        fs.renameSync(tmp, out);
        resolve(true);
      } else {
        fs.rmSync(tmp, { force: true });
        reject(new Error(`proxy failed for ${entry.file}: ${err.trim().split("\n").pop()}`));
      }
    });
  });
}

/**
 * Add every new file in media/ to the timeline's media list. Files already listed
 * (same path) are skipped. Returns { timeline, added: [entries], failed: [{file, error}] }.
 */
export async function importNew(timeline, files = scanMedia()) {
  const next = JSON.parse(JSON.stringify(timeline));
  const known = new Set(next.media.map((m) => m.file));
  const added = [];
  const failed = [];
  for (const file of files) {
    if (known.has(file)) continue;
    try {
      const info = await probe(file);
      if (info.kind !== "image" && !info.duration) throw new Error("ffprobe found no duration");
      const entry = { id: nextId(next, "m"), ...info };
      next.media.push(entry);
      added.push(entry);
      await makeThumb(entry).catch(() => {});
    } catch (e) {
      failed.push({ file, error: e.message.split("\n")[0] });
    }
  }
  return { timeline: next, added, failed };
}
