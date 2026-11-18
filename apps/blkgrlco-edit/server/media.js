// Media library: ffprobe facts, thumbnails, waveforms and H.264 preview proxies.
// Originals in project/media/ are never modified; everything generated lives in project/.cache/.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts"]);
export const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff"]);
export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);

export function mediaType(file) {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function run(cmd, args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => { err += d; onStderr?.(String(d)); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
  });
}

export async function probe(absPath) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:stream_side_data=rotation:stream_tags=rotate",
    "-of", "json", absPath]);
  const data = JSON.parse(out);
  const v = (data.streams || []).find((s) => s.codec_type === "video");
  const a = (data.streams || []).find((s) => s.codec_type === "audio");
  let width = v?.width;
  let height = v?.height;
  const rot = Math.abs(Number(v?.side_data_list?.[0]?.rotation ?? v?.tags?.rotate ?? 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  let fps;
  if (v?.r_frame_rate) {
    const [n, d] = v.r_frame_rate.split("/").map(Number);
    if (d) fps = Math.round((n / d) * 100) / 100;
  }
  return {
    duration: Number(data.format?.duration) || null,
    width, height, fps,
    hasAudio: !!a,
    codec: v?.codec_name || a?.codec_name,
    pixFmt: v?.pix_fmt,
  };
}

/** Stable short key for a file's generated assets (changes if the file changes). */
export function assetKey(absPath) {
  const st = fs.statSync(absPath);
  return crypto.createHash("sha1").update(`${absPath}|${st.size}|${st.mtimeMs}`).digest("hex").slice(0, 12);
}

export class MediaLibrary {
  constructor(projectDir, { log = () => {} } = {}) {
    this.dir = path.join(projectDir, "media");
    this.cache = path.join(projectDir, ".cache");
    for (const d of ["thumbs", "proxies", "waves"]) fs.mkdirSync(path.join(this.cache, d), { recursive: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.log = log;
    this.jobs = new Map(); // key -> Promise
    this.status = new Map(); // file -> { proxy: "ready"|"working"|"error", ... }
  }

  /** Every importable file under media/ (relative paths, sorted). Skips macOS ._ files. */
  listFiles() {
    const out = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(d, e.name), r);
        else if (mediaType(e.name)) out.push(r);
      }
    };
    walk(this.dir, "");
    return out.sort();
  }

  abs(file) {
    const p = path.resolve(this.dir, file);
    if (!p.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("path outside media/");
    return p;
  }

  /** Build media entries for files not yet in `known` (array of media). Returns new entries. */
  async scan(known, makeId) {
    const have = new Set(known.map((m) => m.file));
    const fresh = [];
    for (const file of this.listFiles()) {
      if (have.has(file)) continue;
      const type = mediaType(file);
      try {
        const info = await probe(this.abs(file));
        const entry = { id: makeId(), file, type, duration: info.duration ? Math.round(info.duration * 1000) / 1000 : null };
        if (type !== "audio") Object.assign(entry, { width: info.width, height: info.height });
        if (type === "video") Object.assign(entry, { fps: info.fps, hasAudio: info.hasAudio });
        if (type === "image") entry.duration = null;
        fresh.push(entry);
      } catch (e) {
        this.log(`couldn't read ${file}: ${e.message.split("\n")[0]}`);
      }
    }
    return fresh;
  }

  thumbPath(m) { return path.join(this.cache, "thumbs", `${assetKey(this.abs(m.file))}.jpg`); }
  wavePath(m) { return path.join(this.cache, "waves", `${assetKey(this.abs(m.file))}.png`); }
  proxyPath(m) { return path.join(this.cache, "proxies", `${assetKey(this.abs(m.file))}.mp4`); }

  once(key, fn) {
    if (!this.jobs.has(key)) this.jobs.set(key, fn().finally(() => this.jobs.delete(key)));
    return this.jobs.get(key);
  }

  async thumbnail(m) {
    const out = this.thumbPath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      const src = this.abs(m.file);
      const at = m.type === "video" ? Math.min(1, (m.duration || 2) / 3) : 0;
      const args = m.type === "video" ? ["-ss", String(at), "-i", src] : ["-i", src];
      await run("ffmpeg", ["-v", "error", "-y", ...args, "-frames:v", "1", "-vf", "scale=-2:180", out]);
      return out;
    });
  }

  async waveform(m) {
    const out = this.wavePath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      await run("ffmpeg", ["-v", "error", "-y", "-i", this.abs(m.file), "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1600x120:colors=#9fb3a8", "-frames:v", "1", out]);
      return out;
    });
  }

  /**
   * A small H.264/AAC copy every browser can play (DJI D-Log M is often 10-bit HEVC,
   * which Chrome can't decode). Preview only — export always reads the originals.
   */
  async proxy(m, onProgress) {
    const out = this.proxyPath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      const tmp = out + ".part.mp4";
      this.status.set(m.file, { proxy: "working" });
      onProgress?.(m, "working");
      try {
        await run("ffmpeg", ["-v", "error", "-y", "-i", this.abs(m.file),
          "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)',format=yuv420p",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "15",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp]);
        fs.renameSync(tmp, out);
        this.status.set(m.file, { proxy: "ready" });
        onProgress?.(m, "ready");
        return out;
      } catch (e) {
        this.status.set(m.file, { proxy: "error", error: e.message });
        onProgress?.(m, "error");
        throw e;
      }
    });
  }

  proxyState(m) {
    if (m.type !== "video") return "n/a";
    if (fs.existsSync(this.proxyPath(m))) return "ready";
    return this.status.get(m.file)?.proxy || "pending";
  }
}
