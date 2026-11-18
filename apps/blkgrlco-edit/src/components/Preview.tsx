import React, { useEffect, useRef, useState } from "react";
import { activeSeq, clipLength as clipDuration, isText, type Timeline, type Clip, type TextClip, type MediaClip } from "../../shared/model";

// The preview composites the timeline on a <canvas>: each active video clip gets its own
// hidden <video> (playing an H.264 proxy), audio clips get an <audio>, text is drawn on top.
// Playback follows the app's clock, so elements are nudged back into sync when they drift.

const DRIFT = 0.2; // seconds of drift before we re-seek during playback
const PRELOAD = 1.5; // start loading a clip this many seconds before it's needed

function fadeGain(clip: Clip, local: number, len: number) {
  let g = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) g = Math.min(g, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > len - clip.fadeOut) g = Math.min(g, (len - local) / clip.fadeOut);
  return Math.max(0, Math.min(1, g));
}

type El = (HTMLMediaElement | HTMLImageElement) & { dataset: DOMStringMap };

export default function Preview({ tl, playhead, playing, fonts }: { tl: Timeline; playhead: number; playing: boolean; fonts: { key: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const els = useRef(new Map<string, El>()); // clipId -> media element
  const loadedFonts = useRef(new Set<string>());
  const [fontTick, setFontTick] = useState(0);
  const seq = activeSeq(tl);
  const { width: W, height: H } = seq;

  // Load every font the timeline uses so the canvas can draw with it.
  useEffect(() => {
    const keys = new Set<string>();
    for (const t of seq.tracks) if (t.kind === "text") for (const c of t.clips as TextClip[]) if (c.style?.font && c.style.font !== "default") keys.add(c.style.font);
    for (const k of keys) {
      if (loadedFonts.current.has(k) || !fonts.some((f) => f.key === k)) continue;
      loadedFonts.current.add(k);
      new FontFace(`tlf-${k}`, `url(/api/font/${encodeURIComponent(k)})`).load()
        .then((ff) => { document.fonts.add(ff); setFontTick((n) => n + 1); })
        .catch(() => loadedFonts.current.delete(k));
    }
  }, [tl, fonts]); // eslint-disable-line

  // Create/drop media elements as clips come and go.
  useEffect(() => {
    const live = new Set<string>();
    for (const t of seq.tracks) {
      if (t.kind === "text") continue;
      for (const c of t.clips as MediaClip[]) {
        const m = tl.media.find((x) => x.id === c.media);
        if (!m) continue;
        live.add(c.id);
        const want = `${m.id}:${t.kind}`;
        const have = els.current.get(c.id);
        if (have && have.dataset.key === want) continue;
        if (have instanceof HTMLMediaElement) have.pause();
        let el: El;
        if (m.type === "image") { el = new Image(); el.src = `/api/play/${m.id}`; }
        else {
          const v = document.createElement(m.type === "video" && t.kind === "video" ? "video" : "audio") as HTMLMediaElement;
          v.preload = "auto";
          (v as HTMLVideoElement).playsInline = true;
          v.src = `/api/play/${m.id}`;
          el = v;
        }
        el.dataset.key = want;
        els.current.set(c.id, el);
      }
    }
    for (const [id, el] of els.current) if (!live.has(id)) { if (el instanceof HTMLMediaElement) el.pause(); el.removeAttribute("src"); els.current.delete(id); }
  }, [tl]);

  // Sync every element to the playhead, then draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const scale = canvas.width / W;
    ctx.fillStyle = seq.background || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const t of seq.tracks) {
      if (t.kind === "text") continue;
      for (const c of t.clips as MediaClip[]) {
        const el = els.current.get(c.id);
        if (!el) continue;
        const len = clipDuration(c);
        const local = playhead - c.start;
        const active = local >= 0 && local < len;
        if (!(el instanceof HTMLMediaElement)) continue;
        const target = c.in + Math.max(0, Math.min(local, len - 0.001));
        if (!active) {
          if (!el.paused) el.pause();
          // pre-roll: park upcoming clips on their first frame so the cut is clean
          if (local < 0 && local > -PRELOAD && Math.abs(el.currentTime - c.in) > 0.05) el.currentTime = c.in;
          continue;
        }
        const audible = !t.muted;
        el.volume = Math.min(1, (c.volume ?? 1) * fadeGain(c, local, len));
        el.muted = !audible || (c.volume ?? 1) === 0;
        if (playing) {
          if (Math.abs(el.currentTime - target) > DRIFT) el.currentTime = target;
          if (el.paused) el.play().catch(() => {});
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
        }
      }
    }

    // Draw video layers bottom → top.
    for (const t of seq.tracks) {
      if (t.kind !== "video" || t.hidden) continue;
      for (const c of t.clips as MediaClip[]) {
        const local = playhead - c.start;
        const len = clipDuration(c);
        if (local < 0 || local >= len) continue;
        const el = els.current.get(c.id);
        if (!el) continue;
        const sw = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth;
        const sh = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight;
        if (!sw || !sh) continue;
        const k = c.fit === "contain" ? Math.min(canvas.width / sw, canvas.height / sh) : Math.max(canvas.width / sw, canvas.height / sh);
        const dw = sw * k;
        const dh = sh * k;
        ctx.globalAlpha = fadeGain(c, local, len);
        try { ctx.drawImage(el as CanvasImageSource, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh); } catch { /* not decoded yet */ }
        ctx.globalAlpha = 1;
      }
    }

    // Text on top.
    for (const t of seq.tracks) {
      if (t.kind !== "text" || t.hidden) continue;
      for (const c of t.clips) {
        if (!isText(c)) continue;
        const local = playhead - c.start;
        if (local < 0 || local >= c.duration) continue;
        const s = c.style || {};
        const fam = s.font && s.font !== "default" && loadedFonts.current.has(s.font) ? `"tlf-${s.font}"` : "Arial, Helvetica, sans-serif";
        const weight = s.font && s.font !== "default" ? "normal" : s.bold === false ? "normal" : "bold";
        const size = (s.size || 96) * scale;
        ctx.font = `${weight} ${size}px ${fam}`;
        ctx.textAlign = (s.align || "center") as CanvasTextAlign;
        ctx.textBaseline = "middle";
        ctx.fillStyle = s.color || "#fff";
        ctx.globalAlpha = fadeGain(c, local, c.duration);
        if (s.shadow) { ctx.shadowColor = "rgba(0,0,0,.67)"; ctx.shadowOffsetX = 3 * scale; ctx.shadowOffsetY = 3 * scale; }
        const lines = c.text.split("\n");
        const lh = size * 1.15;
        lines.forEach((line, i) => ctx.fillText(line, (s.x ?? 0.5) * canvas.width, (s.y ?? 0.5) * canvas.height + (i - (lines.length - 1) / 2) * lh));
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = 1;
      }
    }
  });

  // Redraw a few times a second while paused, so frames appear once a seek lands.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (playing) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => () => { for (const el of els.current.values()) if (el instanceof HTMLMediaElement) el.pause(); }, []);

  // Canvas resolution: the project's aspect ratio at a preview-friendly size.
  const ph = 720;
  const pw = Math.round((ph * W) / H);
  return (
    <div className="preview">
      <canvas ref={canvasRef} width={pw} height={ph} data-fonts={fontTick} />
      <div className="preview-meta">{seq.name} · {W}×{H} · {seq.fps} fps · preview uses low-res proxies; export uses the originals</div>
    </div>
  );
}
