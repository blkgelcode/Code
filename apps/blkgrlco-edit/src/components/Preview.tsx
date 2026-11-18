import React, { useEffect, useRef, useState } from "react";
import { activeSeq, clipLength as clipDuration, isText, mediaName, type Timeline, type Clip, type TextClip, type MediaClip, type Media } from "../../shared/model";
import type { MediaStatus } from "../media";

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

interface Props {
  tl: Timeline; playhead: number; playing: boolean; fonts: { key: string }[];
  status: Record<string, MediaStatus>; quality: "proxy" | "full"; setQuality: (q: "proxy" | "full") => void;
}

export default function Preview({ tl, playhead, playing, fonts, status, quality, setQuality }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Originals the browser can't decode live (e.g. some 10-bit HEVC): Full falls back to the proxy.
  const [fullFailed, setFullFailed] = useState<Record<string, true>>({});
  const frames = useRef(new Map<string, HTMLImageElement>()); // full-res stills while paused (Full)
  const [frameTick, setFrameTick] = useState(0);
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

  /** What a clip's element should play: original (Full), proxy, or nothing yet. Streams with range requests. */
  const srcFor = (m: Media, kind: string): string | null => {
    const st = status[m.id];
    if (m.type === "image") return st?.still.state === "ready" ? `/api/media/${m.id}/still` : st?.thumb.state === "ready" ? `/api/media/${m.id}/thumb` : null;
    if (m.type === "audio") return st?.online === false ? null : `/api/media/${m.id}/original`;
    const proxyReady = st?.proxy.state === "ready";
    if (kind === "video" && quality === "full" && st?.online !== false && !fullFailed[m.id]) return `/api/media/${m.id}/original`;
    if (proxyReady) return `/api/media/${m.id}/proxy`;
    return null;
  };

  // Create/drop media elements as clips come and go (or their source changes).
  useEffect(() => {
    const live = new Set<string>();
    for (const t of seq.tracks) {
      if (t.kind === "text") continue;
      for (const c of t.clips as MediaClip[]) {
        const m = tl.media.find((x) => x.id === c.media);
        if (!m) continue;
        const src = srcFor(m, t.kind);
        if (!src) continue;
        live.add(c.id);
        const have = els.current.get(c.id);
        if (have && have.dataset.key === src) continue;
        if (have instanceof HTMLMediaElement) { have.pause(); have.removeAttribute("src"); have.load(); }
        let el: El;
        if (m.type === "image") { el = new Image(); el.src = src; }
        else {
          const v = document.createElement(m.type === "video" && t.kind === "video" ? "video" : "audio") as HTMLMediaElement;
          v.preload = "auto";
          (v as HTMLVideoElement).playsInline = true;
          if (src.endsWith("/original") && m.type === "video") {
            v.addEventListener("error", () => setFullFailed((f) => ({ ...f, [m.id]: true })), { once: true });
          }
          v.src = src;
          el = v;
        }
        el.dataset.key = src;
        els.current.set(c.id, el);
      }
    }
    for (const [id, el] of els.current) if (!live.has(id)) { if (el instanceof HTMLMediaElement) { el.pause(); el.removeAttribute("src"); el.load(); } els.current.delete(id); }
  }, [tl, status, quality, fullFailed]); // eslint-disable-line

  // Full quality while paused: a frame-exact still rendered from the original by the server.
  useEffect(() => {
    if (quality !== "full" || playing) return;
    const id = setTimeout(() => {
      for (const t of seq.tracks) {
        if (t.kind !== "video" || t.hidden) continue;
        for (const c of t.clips as MediaClip[]) {
          const local = playhead - c.start;
          if (local < 0 || local >= clipDuration(c)) continue;
          const m = tl.media.find((x) => x.id === c.media);
          if (!m || m.type !== "video" || status[m.id]?.online === false) continue;
          const srcT = (c.in + local).toFixed(3);
          const key = `${m.id}@${srcT}`;
          if (frames.current.has(key)) continue;
          const img = new Image();
          img.onload = () => setFrameTick((n) => n + 1);
          img.src = `/api/media/${m.id}/frame?t=${srcT}&w=${Math.min(m.width || 1920, 3840)}`;
          frames.current.set(key, img);
          if (frames.current.size > 40) frames.current.delete(frames.current.keys().next().value!);
        }
      }
    }, 120);
    return () => clearTimeout(id);
  }, [playhead, playing, quality, tl, status]); // eslint-disable-line

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
        const m = tl.media.find((x) => x.id === c.media);
        const still = quality === "full" && !playing && m ? frames.current.get(`${m.id}@${(c.in + local).toFixed(3)}`) : undefined;
        const el = (still && still.complete && still.naturalWidth ? still : els.current.get(c.id)) as El | undefined;
        if (!el) {
          if (m) placeholder(ctx, canvas, m, status[m.id]);
          continue;
        }
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
  const failedNames = Object.keys(fullFailed).map((id) => tl.media.find((m) => m.id === id)).filter(Boolean).map((m) => mediaName(m!));
  return (
    <div className="preview">
      <canvas ref={canvasRef} width={pw} height={ph} data-fonts={fontTick} data-frames={frameTick} />
      <div className="preview-meta">
        <div className="quality" role="group" aria-label="Preview quality">
          <button className={quality === "proxy" ? "on" : ""} onClick={() => setQuality("proxy")} title="Light 960×540 previews: smooth on any footage">Proxy</button>
          <button className={quality === "full" ? "on" : ""} onClick={() => setQuality("full")} title="Plays the original files; when paused, shows an exact full-resolution frame">Full</button>
        </div>
        <span>{seq.name} · {W}×{H} · {seq.fps} fps · export always uses the originals</span>
      </div>
      {quality === "full" && failedNames.length > 0 && (
        <div className="preview-note">Full quality can't play {failedNames.slice(0, 2).join(", ")}{failedNames.length > 2 ? ` +${failedNames.length - 2}` : ""} live here, so it plays the proxy (paused frames are still full quality).</div>
      )}
    </div>
  );
}

/** Shown where a clip has nothing to draw yet: offline, or its preview is still being made. */
function placeholder(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, m: Media, st?: MediaStatus) {
  ctx.fillStyle = "#1d0f04";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = st && !st.online ? "#EBB9BA" : "#B4AD7F";
  ctx.font = `bold ${Math.round(canvas.width / 22)}px -apple-system, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const msg = st && !st.online ? `${mediaName(m)} is offline` : st?.proxy.state === "running" ? `Making preview ${Math.round((st.proxy.progress || 0) * 100)}%` : st?.proxy.state === "error" ? "Preview failed" : "Preview queued";
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}
