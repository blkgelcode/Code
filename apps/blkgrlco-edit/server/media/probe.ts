// Reading files: type by extension, folder walking, and ffprobe facts.
import fs from "node:fs";
import path from "node:path";
import { run } from "./run";

export type MediaType = "video" | "audio" | "image";
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".mxf", ".3gp"]);
const AUDIO = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff", ".caf"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".tif", ".tiff"]);

export function mediaType(file: string): MediaType | null {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (IMAGE.has(ext)) return "image";
  return null;
}

/** Every importable file under `dir`, sorted. Skips hidden files, macOS ._ files and app bundles. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    let ents: fs.Dirent[] = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".") || e.name.endsWith(".app") || e.name === ".cache") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else if (e.isFile() && mediaType(e.name)) out.push(p);
    }
  };
  go(dir);
  return out.sort();
}

export interface ProbeInfo {
  type: MediaType;
  duration: number | null;
  width?: number; height?: number; fps?: number; vfr?: boolean;
  hasAudio?: boolean; codec?: string; audioCodec?: string;
  bitDepth?: number; hdr?: "hlg" | "pq"; rotation?: number;
  camera?: string; createdAt?: string; size: number;
}

const ratio = (s?: string) => {
  if (!s) return undefined;
  const [n, d] = s.split("/").map(Number);
  return d ? n / d : undefined;
};
const round = (n: number, k = 1000) => Math.round(n * k) / k;

function cameraOf(file: string, fmtTags: Record<string, string>, vTags: Record<string, string>) {
  const all = { ...fmtTags, ...vTags };
  const model = all["com.apple.quicktime.model"] || all.model;
  const make = all["com.apple.quicktime.make"] || all.make;
  if (model) return [make, model].filter(Boolean).join(" ").trim();
  const blob = `${all.encoder || ""} ${all.handler_name || ""} ${path.basename(file)}`;
  if (/DJI/i.test(blob)) return "DJI";
  if (/GoPro/i.test(blob)) return "GoPro";
  if (/^IMG_\d+\.(mov|heic)$/i.test(path.basename(file))) return "iPhone";
  return undefined;
}

export async function probe(file: string): Promise<ProbeInfo> {
  const type = mediaType(file);
  if (!type) throw new Error("not a video, audio or image file");
  const size = fs.statSync(file).size;
  const out = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:format_tags:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt,bits_per_raw_sample,color_transfer:stream_tags:stream_side_data=rotation",
    "-of", "json", file], { timeoutMs: 20000 });
  const data = JSON.parse(out);
  const v = (data.streams || []).find((s: any) => s.codec_type === "video");
  const a = (data.streams || []).find((s: any) => s.codec_type === "audio");
  const fmtTags = data.format?.tags || {};
  const info: ProbeInfo = { type, duration: null, size };
  const dur = Number(data.format?.duration);
  if (type !== "image") {
    if (!Number.isFinite(dur) || dur <= 0) throw new Error("couldn't read the length (the file may be damaged or still copying)");
    info.duration = round(dur);
  }
  if (type === "video" && !v) throw new Error("no video stream in this file");
  if (type === "audio" && !a) throw new Error("no audio stream in this file");
  if (v && type !== "audio") {
    let w = v.width, h = v.height;
    const rot = Number(v.side_data_list?.find((x: any) => x.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
    if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
    Object.assign(info, { width: w, height: h });
    if (rot) info.rotation = ((rot % 360) + 360) % 360;
    info.codec = v.codec_name;
    const bits = Number(v.bits_per_raw_sample) || (/(10|12)le$/.exec(v.pix_fmt || "")?.[1] ? Number(/(10|12)le$/.exec(v.pix_fmt)![1]) : 8);
    if (type === "video") {
      const r = ratio(v.r_frame_rate), avg = ratio(v.avg_frame_rate);
      if (r) info.fps = round(r, 100);
      if (r && avg && Math.abs(r - avg) / r > 0.01) info.vfr = true;
      info.bitDepth = bits;
      if (v.color_transfer === "arib-std-b67") info.hdr = "hlg";
      else if (v.color_transfer === "smpte2084") info.hdr = "pq";
      info.hasAudio = !!a;
    }
  }
  if (a) info.audioCodec = a.codec_name;
  const cam = cameraOf(file, fmtTags, v?.tags || {});
  if (cam) info.camera = cam;
  const created = fmtTags["com.apple.quicktime.creationdate"] || fmtTags.creation_time;
  if (created && !Number.isNaN(Date.parse(created))) info.createdAt = new Date(created).toISOString();
  return info;
}
