// Render timeline.json to an MP4 with ffmpeg, from the original media files.
//
// Picture: a background canvas, then every visible track from the bottom of the
// list to the top, so a track higher in the list ends up on top. Video and image
// clips are overlaid (fades are alpha fades); text clips are drawtext.
// Sound: every audible clip is delayed to its start, then all are mixed.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { APP_DIR, MEDIA_DIR, EXPORT_DIR, CACHE_DIR } from "./store.js";
import { clipLength, mediaById, totalDuration, round } from "../src/lib/model.js";

const f = (n) => String(round(n));
// One level of filtergraph quoting. Values must not contain ' or : (checked below).
const q = (s) => `'${s}'`;
export const TEXT_DIR = path.join(CACHE_DIR, "text");

/** Build the ffmpeg arguments for a timeline. Exported for tests. */
export function buildFfmpegArgs(tl, outFile) {
  const { width: W, height: H, fps, background } = tl.settings;
  const total = totalDuration(tl);
  if (total <= 0) throw new Error("The timeline is empty: nothing to export.");

  const inputs = [];
  const filters = [];
  const audio = [];
  fs.mkdirSync(TEXT_DIR, { recursive: true });

  filters.push(`color=c=${background}:s=${W}x${H}:r=${fps}:d=${f(total)},format=yuva420p[base0]`);
  let base = "base0";
  let n = 0;

  const addInput = (m, clip) => {
    const len = clipLength(clip);
    const file = path.join(MEDIA_DIR, m.file);
    if (m.kind === "image") inputs.push("-loop", "1", "-framerate", String(fps), "-t", f(len), "-i", file);
    else inputs.push("-ss", f(clip.in), "-t", f(len), "-i", file);
    return inputs.filter((x) => x === "-i").length - 1;
  };

  // bottom of the list first, so tracks higher in the list are drawn on top
  for (const track of [...tl.tracks].reverse()) {
    for (const clip of track.clips) {
      const len = clipLength(clip);
      const start = clip.start;
      const fi = Math.min(clip.fadeIn || 0, len);
      const fo = Math.min(clip.fadeOut || 0, len);

      if (track.kind === "text") {
        if (track.hidden) continue;
        const s = clip.style;
        // text goes through a file so no escaping is needed; ffmpeg runs with cwd = TEXT_DIR
        const tf = `${clip.id.replace(/[^\w-]/g, "_")}.txt`;
        fs.writeFileSync(path.join(TEXT_DIR, tf), clip.text);
        const fontFile = s.fontFile && (path.isAbsolute(s.fontFile) ? s.fontFile : path.join(APP_DIR, s.fontFile));
        if (fontFile && /[':]/.test(fontFile)) throw new Error(`${clip.id}: fontFile path can't contain ' or :`);
        if (/[':]/.test(s.font || "")) throw new Error(`${clip.id}: font name can't contain ' or :`);
        const end = start + len;
        const xExpr = s.align === "left" ? `w*${s.x}` : s.align === "right" ? `w*${s.x}-text_w` : `w*${s.x}-text_w/2`;
        const alpha = `if(lt(t,${f(start + fi)}),${fi > 0 ? `(t-${f(start)})/${f(fi)}` : 1},if(gt(t,${f(end - fo)}),${fo > 0 ? `(${f(end)}-t)/${f(fo)}` : 1},1))`;
        const font = fontFile ? `fontfile=${q(fontFile)}` : `font=${q(s.font || "Arial")}`;
        const box = s.box
          ? `:box=1:boxcolor=${s.box.color || "#000000"}@${s.box.opacity ?? 0.5}:boxborderw=${Math.round(s.box.padding ?? 20)}`
          : "";
        const next = `base${++n}`;
        filters.push(`[${base}]drawtext=${font}:textfile=${q(tf)}:fontsize=${Math.round(s.size)}:fontcolor=${s.color}` +
          `:x='${xExpr}':y='h*${s.y}-text_h/2':alpha='${alpha}'${box}:enable='between(t,${f(start)},${f(end)})'[${next}]`);
        base = next;
        continue;
      }

      const m = mediaById(tl, clip.media);
      const wantPicture = track.kind === "video" && !track.hidden && m.kind !== "audio";
      const vol = (clip.volume ?? 1) * (track.volume ?? 1);
      const wantSound = !track.muted && vol > 0 && (m.kind === "audio" || m.hasAudio) && m.kind !== "image";
      if (!wantPicture && !wantSound) continue;
      const idx = addInput(m, clip);

      if (wantPicture) {
        const fit = clip.fit === "contain"
          ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,format=yuva420p,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`
          : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuva420p`;
        const fades = [
          fi > 0 ? `fade=t=in:st=0:d=${f(fi)}:alpha=1` : null,
          fo > 0 ? `fade=t=out:st=${f(len - fo)}:d=${f(fo)}:alpha=1` : null,
        ].filter(Boolean);
        filters.push(`[${idx}:v]fps=${fps},${fit},setsar=1${fades.map((x) => "," + x).join("")},setpts=PTS-STARTPTS+${f(start)}/TB[clip${idx}v]`);
        const next = `base${++n}`;
        filters.push(`[${base}][clip${idx}v]overlay=eof_action=pass:format=auto[${next}]`);
        base = next;
      }
      if (wantSound) {
        const afades = [
          fi > 0 ? `afade=t=in:st=0:d=${f(fi)}` : null,
          fo > 0 ? `afade=t=out:st=${f(len - fo)}:d=${f(fo)}` : null,
        ].filter(Boolean);
        filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${f(vol)}` +
          `${afades.map((x) => "," + x).join("")},adelay=${Math.round(start * 1000)}:all=1[clip${idx}a]`);
        audio.push(`[clip${idx}a]`);
      }
    }
  }

  filters.push(`[${base}]format=yuv420p[vout]`);
  if (audio.length) filters.push(`${audio.join("")}amix=inputs=${audio.length}:normalize=0:dropout_transition=0,apad[aout]`);
  else filters.push(`anullsrc=r=48000:cl=stereo[aout]`);

  return [
    "-hide_banner", "-v", "error", "-y", "-progress", "pipe:1",
    ...inputs,
    "-filter_complex", filters.join(";\n"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", f(total), "-r", String(fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    outFile,
  ];
}

/** Export the timeline. Resolves with the output path. */
export function exportTimeline(tl, { onProgress = () => {}, outFile } = {}) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = outFile || path.join(EXPORT_DIR, `export-${stamp}.mp4`);
  const tmp = out.replace(/\.mp4$/, ".part.mp4");
  const args = buildFfmpegArgs(tl, tmp);
  const total = totalDuration(tl);
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { cwd: TEXT_DIR });
    p.stdout.on("data", (buf) => {
      const m = /out_time_us=(\d+)/.exec(buf.toString());
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
    });
    let err = "";
    p.stderr.on("data", (b) => (err += b));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) {
        fs.renameSync(tmp, out);
        onProgress(1);
        resolve(out);
      } else {
        fs.rmSync(tmp, { force: true });
        reject(new Error(`ffmpeg failed: ${err.trim().split("\n").slice(-3).join(" / ")}`));
      }
    });
  });
}
