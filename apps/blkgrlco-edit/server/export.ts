// Render a sequence to MP4 with one ffmpeg run, reading the ORIGINAL media (never proxies).
// Phase 11 adds presets, the render queue and hardware encoders; this is the basic path.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { clipLength, sequenceDuration, isText, type Timeline, type Sequence, type MediaClip, type TextClip } from "../shared/model";
import { fontFileFor, type FontInfo } from "./fonts";

const f3 = (n: number) => (Math.round(n * 1000) / 1000).toString();
const colorOf = (hex?: string) => (/^#[0-9a-f]{6}$/i.test(hex || "") ? `0x${hex!.slice(1)}` : "0x000000");

// ffmpeg filter values can't contain a single quote even when quoted, so fonts and text go
// through plain-named copies in a quote-free folder.
function safeDir(workDir: string) {
  const d = /['\\]/.test(workDir) ? fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-")) : workDir;
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function safeFontPath(file: string, dir: string) {
  const out = path.join(dir, crypto.createHash("sha1").update(file).digest("hex").slice(0, 12) + path.extname(file).toLowerCase());
  if (!fs.existsSync(out)) fs.copyFileSync(file, out);
  return out;
}
const q = (p: string) => `'${p}'`;

export interface ExportOpts { fonts: Map<string, FontInfo>; workDir: string; outFile: string }

export function buildExportArgs(tl: Timeline, seq: Sequence, { fonts, workDir, outFile }: ExportOpts) {
  const { width: W, height: H, fps } = seq;
  const total = Math.max(sequenceDuration(seq), 0.04);
  const bg = colorOf(seq.background);
  const media = new Map(tl.media.map((m) => [m.id, m]));
  const args = ["-hide_banner", "-y", "-f", "lavfi", "-i", `color=c=${bg}:s=${W}x${H}:r=${fps}:d=${f3(total)}`];
  const filters: string[] = [];
  let nIn = 1;
  const layers: { label: string; start: number; end: number }[] = [];
  const audio: string[] = [];

  for (const t of seq.tracks) {
    if (t.kind === "text") continue;
    for (const c of t.clips as MediaClip[]) {
      const m = media.get(c.media);
      if (!m) continue;
      const dur = clipLength(c);
      const wantsVideo = t.kind === "video" && !t.hidden && m.type !== "audio";
      const wantsAudio = !t.muted && c.volume > 0 && (m.type === "audio" || (m.type === "video" && !!m.hasAudio));
      if (!wantsVideo && !wantsAudio) continue;
      if (m.type === "image") args.push("-loop", "1", "-framerate", String(fps), "-t", f3(dur), "-i", m.path);
      else args.push("-ss", f3(c.in), "-t", f3(dur), "-i", m.path);
      const idx = nIn++;
      if (wantsVideo) {
        const fit = c.fit === "contain"
          ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bg}`
          : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
        const parts = [`[${idx}:v]${fit}`, "setsar=1", `fps=${fps}`, "format=yuva420p"];
        if (c.fadeIn > 0) parts.push(`fade=t=in:st=0:d=${f3(c.fadeIn)}:alpha=1`);
        if (c.fadeOut > 0) parts.push(`fade=t=out:st=${f3(Math.max(0, dur - c.fadeOut))}:d=${f3(c.fadeOut)}:alpha=1`);
        parts.push(`setpts=PTS-STARTPTS+${f3(c.start)}/TB`);
        filters.push(`${parts.join(",")}[v${c.id}]`);
        layers.push({ label: `v${c.id}`, start: c.start, end: c.start + dur });
      }
      if (wantsAudio) {
        const parts = [`[${idx}:a]asetpts=PTS-STARTPTS`, "aresample=48000", "aformat=channel_layouts=stereo", `volume=${f3(c.volume)}`];
        if (c.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${f3(c.fadeIn)}`);
        if (c.fadeOut > 0) parts.push(`afade=t=out:st=${f3(Math.max(0, dur - c.fadeOut))}:d=${f3(c.fadeOut)}`);
        parts.push(`adelay=${Math.round(c.start * 1000)}:all=1`);
        filters.push(`${parts.join(",")}[a${c.id}]`);
        audio.push(`a${c.id}`);
      }
    }
  }

  let cur = "0:v";
  layers.forEach((L, i) => {
    filters.push(`[${cur}][${L.label}]overlay=eof_action=pass:enable='between(t,${f3(L.start)},${f3(L.end)})'[ov${i}]`);
    cur = `ov${i}`;
  });

  const textDir = safeDir(workDir);
  let n = 0;
  for (const t of seq.tracks) {
    if (t.kind !== "text" || t.hidden) continue;
    for (const c of t.clips as TextClip[]) {
      if (!isText(c)) continue;
      const s = c.style;
      const file = path.join(textDir, `text-${c.id.replace(/[^\w-]/g, "")}.txt`);
      fs.writeFileSync(file, c.text);
      const st = c.start, en = c.start + c.duration, fi = c.fadeIn, fo = c.fadeOut;
      let alpha = "1";
      if (fi > 0 || fo > 0) {
        const a = fi > 0 ? `if(lt(t,${f3(st + fi)}),(t-${f3(st)})/${f3(fi)},1)` : "1";
        const b = fo > 0 ? `if(gt(t,${f3(en - fo)}),(${f3(en)}-t)/${f3(fo)},1)` : "1";
        alpha = `min(${a},${b})`;
      }
      const x = s.align === "left" ? `${f3(s.x)}*w` : s.align === "right" ? `${f3(s.x)}*w-text_w` : `${f3(s.x)}*w-text_w/2`;
      const opts = [
        `fontfile=${q(safeFontPath(fontFileFor(fonts, s), textDir))}`, `textfile=${q(file)}`,
        `fontsize=${Math.round(s.size)}`, `fontcolor=${colorOf(s.color)}`,
        `x='${x}'`, `y='${f3(s.y)}*h-text_h/2'`, `alpha='${alpha}'`, `enable='between(t,${f3(st)},${f3(en)})'`,
      ];
      if (s.shadow) opts.push("shadowcolor=0x000000AA", "shadowx=3", "shadowy=3");
      filters.push(`[${cur}]drawtext=${opts.join(":")}[tx${n}]`);
      cur = `tx${n++}`;
    }
  }
  filters.push(`[${cur}]format=yuv420p[vout]`);
  filters.push(audio.length
    ? `${audio.map((l) => `[${l}]`).join("")}amix=inputs=${audio.length}:normalize=0:duration=longest,apad[aout]`
    : "anullsrc=r=48000:cl=stereo[aout]");

  args.push("-filter_complex", filters.join(";\n"), "-map", "[vout]", "-map", "[aout]",
    "-t", f3(total), "-r", String(fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", outFile);
  return { args, total };
}

export function runExport(tl: Timeline, seq: Sequence, opts: ExportOpts, onProgress: (p: number) => void = () => {}) {
  const { args, total } = buildExportArgs(tl, seq, opts);
  fs.writeFileSync(path.join(opts.workDir, "last-export-args.txt"), args.join("\n"));
  return new Promise<string>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stdout.on("data", (d: Buffer) => {
      const m = /out_time_(?:us|ms)=(\d+)/.exec(String(d));
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
    });
    p.stderr.on("data", (d: Buffer) => { err = (err + d).slice(-4000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? (onProgress(1), resolve(opts.outFile)) : reject(new Error(err.trim().split("\n").slice(-6).join("\n")))));
  });
}
