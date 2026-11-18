import React, { useEffect, useRef, useState } from "react";
import { clipDuration } from "../ops.js";

// The preview composites the timeline on a <canvas>: each active video clip gets its own
// hidden <video> (playing an H.264 proxy), audio clips get an <audio>, text is drawn on top.
// Playback follows the app's clock, so elements are nudged back into sync when they drift.

const DRIFT = 0.2; // seconds of drift before we re-seek during playback
const PRELOAD = 1.5; // start loading a clip this many seconds before it's needed

function fadeGain(clip, local, len) {
  let g = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) g = Math.min(g, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > len - clip.fadeOut) g = Math.min(g, (len - local) / clip.fadeOut);
  return Math.max(0, Math.min(1, g));
}

export default function Preview({ tl, playhead, playing, fonts }) {
  const canvasRef = useRef(null);
  const els = useRef(new Map()); // clipId -> HTMLMediaElement | HTMLImageElement
  const loadedFonts = useRef(new Set());
  const [fontTick, setFontTick] = useState(0);
  const { width: W, height: H } = tl.project;

  // Load every font the timeline uses so the canvas can draw with it.
  useEffect(() => {
    const keys = new Set();
    for (const t of tl.tracks) if (t.kind === "text") for (const c of t.clips) if (c.style?.font && c.style.font !== "default") keys.add(c.style.font);
    for (const k of keys) {
      if (loadedFonts.current.has(k) || !fonts.some((f) => f.key === k)) continue;
      loadedFonts.current.add(k);
      new FontFace(`tlf-${k}`, `url(/api/font/${encodeURIComponent(k)})`).load()
        .then((ff) => { document.fonts.add(ff); setFontTick((n) => n + 1); })
        .catch(() => loadedFonts.current.delete(k));
    }
  }, [tl, fonts]);

  // Create/drop media elements as clips come and go.
  useEffect(() => {
    const live = new Set();
    for (const t of tl.tracks) {
      if (t.kind === "text") continue;
      for (const c of t.clips) {
        const m = tl.media.find((x) => x.id === c.media);
        if (!m) continue;
        live.add(c.id);
        const want = `${m.id}:${t.kind}`;
        const have = els.current.get(c.id);
        if (have && have.dataset.key === want) continue;
        have?.pause?.();
        let el;
        if (m.type === "image") { el = new Image(); el.src = `/api/play/${m.id}`; }
        else {
          el = document.createElement(m.type === "video" && t.kind === "video" ? "video" : "audio");
          el.preload = "auto";
          el.playsInline = true;
          el.src = `/api/play/${m.id}`;
        }
        el.dataset.key = want;
        els.current.set(c.id, el);
      }
    }
    for (const [id, el] of els.current) if (!live.has(id)) { el.pause?.(); el.removeAttribute?.("src"); els.current.delete(id); }
  }, [tl]);

  // Sync every element to the playhead, then draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const scale = canvas.width / W;
    ctx.fillStyle = tl.project.background || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const t of tl.tracks) {
      if (t.kind === "text") continue;
      for (const c of t.clips) {
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
    for (const t of tl.tracks) {
      if (t.kind !== "video" || t.hidden) continue;
      for (const c of t.clips) {
        const local = playhead - c.start;
        const len = clipDuration(c);
        if (local < 0 || local >= len) continue;
        const el = els.current.get(c.id);
        if (!el) continue;
        const sw = el.videoWidth || el.naturalWidth;
        const sh = el.videoHeight || el.naturalHeight;
        if (!sw || !sh) continue;
        const k = c.fit === "contain" ? Math.min(canvas.width / sw, canvas.height / sh) : Math.max(canvas.width / sw, canvas.height / sh);
        const dw = sw * k;
        const dh = sh * k;
        ctx.globalAlpha = fadeGain(c, local, len);
        try { ctx.drawImage(el, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh); } catch { /* not decoded yet */ }
        ctx.globalAlpha = 1;
      }
    }

    // Text on top.
    for (const t of tl.tracks) {
      if (t.kind !== "text" || t.hidden) continue;
      for (const c of t.clips) {
        const local = playhead - c.start;
        if (local < 0 || local >= c.duration) continue;
        const s = c.style || {};
        const fam = s.font && s.font !== "default" && loadedFonts.current.has(s.font) ? `"tlf-${s.font}"` : "Arial, Helvetica, sans-serif";
        const weight = s.font && s.font !== "default" ? "normal" : s.bold === false ? "normal" : "bold";
        const size = (s.size || 96) * scale;
        ctx.font = `${weight} ${size}px ${fam}`;
        ctx.textAlign = s.align || "center";
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

  useEffect(() => () => { for (const el of els.current.values()) el.pause?.(); }, []);

  // Canvas resolution: the project's aspect ratio at a preview-friendly size.
  const ph = 720;
  const pw = Math.round((ph * W) / H);
  return (
    <div className="preview">
      <canvas ref={canvasRef} width={pw} height={ph} data-fonts={fontTick} />
      <div className="preview-meta">{W}×{H} · {tl.project.fps} fps · preview uses low-res proxies; export uses the originals</div>
    </div>
  );
}
