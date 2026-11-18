// Media engine: ffprobe facts, thumbnails, waveforms and H.264 preview proxies.
// Media is referenced by absolute path and never modified or copied; generated files live in project/.cache/.
// (Phase 2 replaces this with the full background queue, fingerprints and offline handling.)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts"]);
export const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff"]);
export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);

export function mediaType(file: string): "video" | "audio" | "image" | null {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function run(cmd: string, args: string[], { onStderr }: { onStderr?: (s: string) => void } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d));
    p.stderr.on("data", (d: Buffer) => { err += d; onStderr?.(String(d)); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
  });
}

export async function probe(absPath: string) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:stream_side_data=rotation:stream_tags=rotate",
    "-of", "json", absPath]);
  const data = JSON.parse(out);
  const v = (data.streams || []).find((s: any) => s.codec_type === "video");
  const a = (data.streams || []).find((s: any) => s.codec_type === "audio");
  let width = v?.width;
  let height = v?.height;
  const rot = Math.abs(Number(v?.side_data_list?.[0]?.rotation ?? v?.tags?.rotate ?? 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  let fps: number | undefined;
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
export function assetKey(absPath: string) {
  const st = fs.statSync(absPath);
  return crypto.createHash("sha1").update(`${absPath}|${st.size}|${st.mtimeMs}`).digest("hex").slice(0, 12);
}

type M = { id: string; path: string; type: string; duration: number | null; hasAudio?: boolean };
type ProxyState = "ready" | "working" | "pending" | "error" | "n/a";

export class MediaLibrary {
  cache: string;
  jobs = new Map<string, Promise<string>>();
  status = new Map<string, { proxy: ProxyState; error?: string }>();
  constructor(projectDir: string, private log: (...a: unknown[]) => void = () => {}) {
    this.cache = path.join(projectDir, ".cache");
    for (const d of ["thumbs", "proxies", "waves"]) fs.mkdirSync(path.join(this.cache, d), { recursive: true });
  }

  /** Every importable file under `dir` (absolute paths, sorted). Skips hidden and macOS ._ files. */
  static walk(dir: string): string[] {
    const out: string[] = [];
    const go = (d: string) => {
      let ents: fs.Dirent[] = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) go(p);
        else if (mediaType(e.name)) out.push(p);
      }
    };
    go(dir);
    return out.sort();
  }

  /** A media entry for a file (no id). Throws if ffprobe can't read it. */
  async describe(absPath: string) {
    const type = mediaType(absPath);
    if (!type) throw new Error(`not a video, audio or image file: ${path.basename(absPath)}`);
    const info = await probe(absPath);
    const e: any = { path: absPath, name: path.basename(absPath), type, duration: type === "image" ? null : info.duration ? Math.round(info.duration * 1000) / 1000 : null };
    if (type !== "audio" && info.width) Object.assign(e, { width: info.width, height: info.height });
    if (type === "video") { if (info.fps) e.fps = info.fps; e.hasAudio = info.hasAudio; }
    if (info.codec) e.codec = info.codec;
    if (type !== "image" && !e.duration) throw new Error(`couldn't read the duration of ${path.basename(absPath)}`);
    return e;
  }

  private key(m: M) { return assetKey(m.path); }
  thumbPath(m: M) { return path.join(this.cache, "thumbs", `${this.key(m)}.jpg`); }
  wavePath(m: M) { return path.join(this.cache, "waves", `${this.key(m)}.png`); }
  proxyPath(m: M) { return path.join(this.cache, "proxies", `${this.key(m)}.mp4`); }

  private once(key: string, fn: () => Promise<string>) {
    if (!this.jobs.has(key)) this.jobs.set(key, fn().finally(() => this.jobs.delete(key)));
    return this.jobs.get(key)!;
  }

  async thumbnail(m: M) {
    const out = this.thumbPath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      const at = m.type === "video" ? Math.min(1, (m.duration || 2) / 3) : 0;
      const args = m.type === "video" ? ["-ss", String(at), "-i", m.path] : ["-i", m.path];
      await run("ffmpeg", ["-v", "error", "-y", ...args, "-frames:v", "1", "-vf", "scale=-2:180", out]);
      return out;
    });
  }

  async waveform(m: M) {
    const out = this.wavePath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      await run("ffmpeg", ["-v", "error", "-y", "-i", m.path, "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1600x120:colors=#9fb3a8", "-frames:v", "1", out]);
      return out;
    });
  }

  /** Small H.264 copy every browser can play. Preview only; export reads the originals. */
  async proxy(m: M, onState?: (m: M, s: ProxyState) => void) {
    const out = this.proxyPath(m);
    if (fs.existsSync(out)) return out;
    return this.once(out, async () => {
      const tmp = out + ".part.mp4";
      this.status.set(m.path, { proxy: "working" });
      onState?.(m, "working");
      try {
        await run("ffmpeg", ["-v", "error", "-y", "-i", m.path,
          "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)',format=yuv420p",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "30",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp]);
        fs.renameSync(tmp, out);
        this.status.set(m.path, { proxy: "ready" });
        onState?.(m, "ready");
        return out;
      } catch (e) {
        this.status.set(m.path, { proxy: "error", error: (e as Error).message });
        onState?.(m, "error");
        throw e;
      }
    });
  }

  proxyState(m: M): ProxyState {
    if (m.type !== "video") return "n/a";
    try { if (fs.existsSync(this.proxyPath(m))) return "ready"; } catch { return "error"; }
    return this.status.get(m.path)?.proxy || "pending";
  }
}
