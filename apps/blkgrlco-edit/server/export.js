// Render timeline.json to an MP4 with one ffmpeg run. Reads the original media (never proxies).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { clipDuration, timelineDuration } from "./timeline.js";
import { fontFileFor } from "./fonts.js";

const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
// ffmpeg filter option values can't hold a single quote even when quoted, so fonts and text
// files get copied to plain names (letters, digits, dashes) in a quote-free folder.
function safeDir(workDir) {
  const d = /['\\]/.test(workDir) ? fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-")) : workDir;
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function safeFontPath(file, dir) {
  const ext = path.extname(file).toLowerCase();
  const name = crypto.createHash("sha1").update(file).digest("hex").slice(0, 12) + ext;
  const out = path.join(dir, name);
  if (!fs.existsSync(out)) fs.copyFileSync(file, out);
  return out;
}
const q = (p) => `'${p}'`;

const colorOf = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || "") ? `0x${hex.slice(1)}` : "0x000000");

/**
 * Build the ffmpeg argument list. Pure apart from writing text files for drawtext
 * (into workDir), so it can be unit-tested.
 */
export function buildExportArgs(tl, { mediaAbs, fonts, workDir, outFile }) {
  const { width: W, height: H, fps } = tl.project;
  const total = Math.max(timelineDuration(tl), 0.04);
  const bg = colorOf(tl.project.background);
  const media = new Map(tl.media.map((m) => [m.id, m]));
  const args = ["-hide_banner", "-y"];
  const filters = [];
  let nIn = 0;

  // Input 0: the background canvas.
  args.push("-f", "lavfi", "-i", `color=c=${bg}:s=${W}x${H}:r=${fps}:d=${f3(total)}`);
  nIn++;

  const videoLayers = []; // labels in stacking order
  const audioLabels = [];

  const addClipInput = (c, m) => {
    const dur = clipDuration(c);
    if (m.type === "image") args.push("-loop", "1", "-framerate", String(fps), "-t", f3(dur), "-i", mediaAbs(m));
    else args.push("-ss", f3(c.in), "-t", f3(dur), "-i", mediaAbs(m));
    return nIn++;
  };

  const audioChain = (idx, c, dur, label) => {
    const vol = c.volume ?? 1;
    const parts = [`[${idx}:a]asetpts=PTS-STARTPTS`, `aresample=48000`, `aformat=channel_layouts=stereo`, `volume=${f3(vol)}`];
    if (c.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${f3(c.fadeIn)}`);
    if (c.fadeOut > 0) parts.push(`afade=t=out:st=${f3(Math.max(0, dur - c.fadeOut))}:d=${f3(c.fadeOut)}`);
    parts.push(`adelay=${Math.round(c.start * 1000)}:all=1`);
    filters.push(`${parts.join(",")}[${label}]`);
    audioLabels.push(label);
  };

  for (const t of tl.tracks) {
    if (t.kind === "text") continue;
    for (const c of [...t.clips].sort((a, b) => a.start - b.start)) {
      const m = media.get(c.media);
      if (!m) continue;
      const dur = clipDuration(c);
      const wantsVideo = t.kind === "video" && !t.hidden && m.type !== "audio";
      const wantsAudio = !t.muted && (c.volume ?? 1) > 0 && (m.type === "audio" || (m.type === "video" && m.hasAudio));
      if (!wantsVideo && !wantsAudio) continue;
      const idx = addClipInput(c, m);
      if (wantsVideo) {
        const fit = c.fit === "contain"
          ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bg}`
          : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
        const parts = [`[${idx}:v]${fit}`, "setsar=1", `fps=${fps}`, "format=yuva420p"];
        if (c.fadeIn > 0) parts.push(`fade=t=in:st=0:d=${f3(c.fadeIn)}:alpha=1`);
        if (c.fadeOut > 0) parts.push(`fade=t=out:st=${f3(Math.max(0, dur - c.fadeOut))}:d=${f3(c.fadeOut)}:alpha=1`);
        parts.push(`setpts=PTS-STARTPTS+${f3(c.start)}/TB`);
        const label = `v${c.id}`;
        filters.push(`${parts.join(",")}[${label}]`);
        videoLayers.push({ label, start: c.start, end: c.start + dur });
      }
      if (wantsAudio) audioChain(idx, c, dur, `a${c.id}`);
    }
  }

  // Stack video layers over the background, bottom track first.
  let cur = "0:v";
  videoLayers.forEach((L, i) => {
    const out = `ov${i}`;
    filters.push(`[${cur}][${L.label}]overlay=eof_action=pass:enable='between(t,${f3(L.start)},${f3(L.end)})'[${out}]`);
    cur = out;
  });

  // Text overlays, drawn on top in track order.
  let textN = 0;
  const textDir = safeDir(workDir);
  for (const t of tl.tracks) {
    if (t.kind !== "text" || t.hidden) continue;
    for (const c of t.clips) {
      const s = c.style || {};
      const file = path.join(textDir, `text-${c.id.replace(/[^\w-]/g, "")}.txt`);
      fs.writeFileSync(file, c.text);
      const st = c.start;
      const en = c.start + c.duration;
      const fi = c.fadeIn || 0;
      const fo = c.fadeOut || 0;
      let alpha = "1";
      if (fi > 0 || fo > 0) {
        const a = fi > 0 ? `if(lt(t,${f3(st + fi)}),(t-${f3(st)})/${f3(fi)},1)` : "1";
        const b = fo > 0 ? `if(gt(t,${f3(en - fo)}),(${f3(en)}-t)/${f3(fo)},1)` : "1";
        alpha = `min(${a},${b})`;
      }
      const x = s.align === "left" ? `${f3(s.x ?? 0.5)}*w` : s.align === "right" ? `${f3(s.x ?? 0.5)}*w-text_w` : `${f3(s.x ?? 0.5)}*w-text_w/2`;
      const y = `${f3(s.y ?? 0.5)}*h-text_h/2`;
      const opts = [
        `fontfile=${q(safeFontPath(fontFileFor(fonts, s), textDir))}`,
        `textfile=${q(file)}`,
        `fontsize=${Math.round(s.size || 96)}`,
        `fontcolor=${colorOf(s.color || "#FFFFFF")}`,
        `x='${x}'`, `y='${y}'`,
        `alpha='${alpha}'`,
        `enable='between(t,${f3(st)},${f3(en)})'`,
      ];
      if (s.shadow) opts.push("shadowcolor=0x000000AA", "shadowx=3", "shadowy=3");
      const out = `tx${textN++}`;
      filters.push(`[${cur}]drawtext=${opts.join(":")}[${out}]`);
      cur = out;
    }
  }
  filters.push(`[${cur}]format=yuv420p[vout]`);

  if (audioLabels.length) {
    filters.push(`${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,apad[aout]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo[aout]`);
  }

  args.push("-filter_complex", filters.join(";\n"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", f3(total), "-r", String(fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats", outFile);
  return { args, total };
}

/** Run an export. onProgress(fraction 0–1). Resolves to the output path. */
export function runExport(tl, opts, onProgress = () => {}) {
  const { args, total } = buildExportArgs(tl, opts);
  fs.writeFileSync(path.join(opts.workDir, "last-export-args.txt"), args.join("\n"));
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stdout.on("data", (d) => {
      const m = /out_time_(?:us|ms)=(\d+)/.exec(String(d));
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
    });
    p.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? (onProgress(1), resolve(opts.outFile)) : reject(new Error(err.trim().split("\n").slice(-6).join("\n")))));
  });
}
