import React, { useEffect, useRef, useState } from "react";
import { activeSeq, clipLength, isText, mediaName, type Timeline, type Media, type MediaClip, type TextClip } from "../../shared/model";
import type { MediaStatus } from "../media";
import { Compositor, type Layer } from "../engine/compositor";
import type { FrameEngine, VideoSource } from "../engine/frames";
import type { Transport } from "../engine/transport";

// One monitor. "program" shows the active sequence; "source" shows a single clip from the bin.
// Frames come from the frame engine (WebCodecs, frame-exact); the GPU composites them.

export type Quality = "proxy" | "full";
interface Common { engine: FrameEngine; transport: Transport; status: Record<string, MediaStatus>; quality: Quality; active: boolean; onActivate: () => void }
interface ProgramProps extends Common { kind: "program"; tl: Timeline; fonts: { key: string }[] }
interface SourceProps extends Common { kind: "source"; media: Media | null; marks: { in?: number; out?: number } }

const fade = (fadeIn: number, fadeOut: number, local: number, len: number) => {
  let g = 1;
  if (fadeIn > 0 && local < fadeIn) g = Math.min(g, local / fadeIn);
  if (fadeOut > 0 && local > len - fadeOut) g = Math.min(g, (len - local) / fadeOut);
  return Math.max(0, Math.min(1, g));
};

declare global { interface Window { __viewers?: Record<string, any> } }

export default function Viewer(props: ProgramProps | SourceProps) {
  const { engine, transport, status, quality, active, onActivate } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const comp = useRef<Compositor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbacks, setFallbacks] = useState<string[]>([]);
  const fontsLoaded = useRef(new Set<string>());
  const serverStills = useRef(new Map<string, ImageBitmap | "loading">());
  const propsRef = useRef(props);
  propsRef.current = props;
  const stats = useRef({ renders: 0, exact: 0, approx: 0, missing: 0, lastWantAt: 0, latencies: [] as number[], pendingSince: 0 });

  const seqSize = () => {
    const p = propsRef.current;
    if (p.kind === "program") { const s = activeSeq(p.tl); return { w: s.width, h: s.height, fps: s.fps, bg: s.background }; }
    const m = p.media;
    return { w: m?.width || 1920, h: m?.height || 1080, fps: m?.fps || 30, bg: "#000000" };
  };

  // ------------------------------------------------------------ canvas + resize
  useEffect(() => {
    try { comp.current = new Compositor(canvasRef.current!); } catch (e) { setError(String((e as Error).message)); }
    const ro = new ResizeObserver(() => schedule());
    ro.observe(wrapRef.current!);
    return () => { ro.disconnect(); comp.current?.dispose(); comp.current = null; };
  }, []); // eslint-disable-line

  // ------------------------------------------------------------ fonts for titles
  useEffect(() => {
    if (props.kind !== "program") return;
    for (const t of activeSeq(props.tl).tracks) if (t.kind === "text") for (const c of t.clips as TextClip[]) {
      const k = c.style?.font;
      if (!k || k === "default" || fontsLoaded.current.has(k) || !props.fonts.some((f) => f.key === k)) continue;
      fontsLoaded.current.add(k);
      new FontFace(`tlf-${k}`, `url(/api/font/${encodeURIComponent(k)})`).load().then((ff) => { document.fonts.add(ff); schedule(); }).catch(() => fontsLoaded.current.delete(k));
    }
  }); // eslint-disable-line

  // ------------------------------------------------------------ render loop
  const rafRef = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  // Subscriptions are made once, so they must not capture this render's props: always call the
  // latest render function, which reads the latest props.
  const schedule = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; renderRef.current(); }); };
  useEffect(() => {
    const a = transport.subscribe(schedule);
    const b = engine.onFrames(schedule);
    return () => { a(); b(); cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [transport, engine]); // eslint-disable-line
  useEffect(schedule); // any prop change

  /** Pick the source for a video: original in Full quality (if this Mac can decode it), else the proxy. */
  const videoSource = (m: Media): { src?: VideoSource; fallback?: string } => {
    const { status, quality, engine } = propsRef.current;
    const st = status[m.id];
    const proxy = st?.proxy.state === "ready" ? engine.video(`${m.id}:proxy`, `/api/media/${m.id}/proxy`) : undefined;
    if (quality === "full" && st?.online !== false) {
      const orig = engine.video(`${m.id}:orig`, `/api/media/${m.id}/original`);
      if (orig.state === "ready") return { src: orig };
      if (orig.state === "unsupported" || orig.state === "error") return { src: proxy, fallback: `${mediaName(m)} (${orig.error})` };
      return { src: proxy && proxy.state === "ready" ? proxy : orig }; // still opening: proxy meanwhile
    }
    return { src: proxy };
  };

  /** Full quality, paused, original not decodable here: exact still rendered from the original by the server. */
  const serverStill = (m: Media, srcT: number) => {
    const key = `${m.id}@${srcT.toFixed(5)}`;
    const have = serverStills.current.get(key);
    if (have && have !== "loading") return have;
    if (!have) {
      serverStills.current.set(key, "loading");
      fetch(`/api/media/${m.id}/frame?t=${srcT.toFixed(5)}&w=${Math.min(m.width || 1920, 3840)}`).then((r) => r.blob()).then(createImageBitmap)
        .then((b) => { serverStills.current.set(key, b); if (serverStills.current.size > 30) { const k0 = serverStills.current.keys().next().value!; const v = serverStills.current.get(k0); if (v && v !== "loading") v.close(); serverStills.current.delete(k0); } schedule(); })
        .catch(() => serverStills.current.delete(key));
    }
    return undefined;
  };

  renderRef.current = render;
  function render() {
    const c = comp.current, wrap = wrapRef.current;
    if (!c || !wrap) return;
    const p = propsRef.current;
    const { status, engine, transport } = p;
    const { w: W, h: H, fps, bg } = seqSize();
    // drawing buffer: fit the monitor area at screen resolution, never above the sequence size
    const dpr = window.devicePixelRatio || 1;
    const box = wrap.getBoundingClientRect();
    const scale = Math.min((box.width * dpr) / W, (box.height * dpr) / H, 1);
    const cw = Math.max(2, Math.round(W * scale)), ch = Math.max(2, Math.round(H * scale));
    c.resize(cw, ch);
    const canvas = canvasRef.current!;
    canvas.style.width = `${cw / dpr}px`;
    canvas.style.height = `${ch / dpr}px`;

    const t = Math.floor(transport.time * fps + 1e-6) / fps;
    const playing = transport.playing;
    const dir = transport.rate < 0 ? -1 : 1;
    const lead = playing ? Math.min(4, 1 + Math.ceil(Math.abs(transport.rate))) : 0;
    const layers: Layer[] = [];
    const notes: string[] = [];
    const fb: string[] = [];
    let anyExactMissing = false;

    const addVideo = (m: Media, srcT: number, fit: "cover" | "contain", alpha: number) => {
      const st = status[m.id];
      if (m.type === "image") {
        const still = engine.still(st?.still.state === "ready" ? `/api/media/${m.id}/still` : `/api/media/${m.id}/thumb`);
        if (still.bmp) layers.push({ source: still.bmp, width: still.bmp.width, height: still.bmp.height, fit, alpha });
        return;
      }
      const { src, fallback } = videoSource(m);
      if (fallback) fb.push(fallback);
      if (fallback && !playing) {
        const s = serverStill(m, srcT);
        if (s) { layers.push({ source: s, width: s.width, height: s.height, fit, alpha }); return; }
      }
      if (!src || src.state !== "ready") {
        if (st && !st.online) notes.push(`${mediaName(m)} is offline`);
        else if (st?.proxy.state === "running") notes.push(`Making preview ${Math.round((st.proxy.progress || 0) * 100)}%`);
        else if (st?.proxy.state === "error") notes.push("Preview failed");
        else notes.push(src?.state === "opening" || st?.proxy.state === "ready" ? "" : "Preview queued");
        return;
      }
      src.want(srcT, dir, lead);
      const exact = src.get(srcT);
      const bmp = exact || src.nearest(srcT);
      if (exact) stats.current.exact++; else { anyExactMissing = true; if (bmp) stats.current.approx++; else stats.current.missing++; }
      if (bmp) layers.push({ source: bmp, width: bmp.width, height: bmp.height, fit, alpha });
    };

    const tx = c.text;
    tx.clearRect(0, 0, cw, ch);
    let drewText = false;

    if (p.kind === "program") {
      const seq = activeSeq(p.tl);
      for (const tr of seq.tracks) {
        if (tr.kind !== "video" || tr.hidden) continue;
        for (const clip of tr.clips as MediaClip[]) {
          const local = t - clip.start;
          const len = clipLength(clip);
          if (local < 0 || local >= len - 1e-9) continue;
          const m = p.tl.media.find((x) => x.id === clip.media);
          if (m) addVideo(m, clip.in + local, clip.fit || "cover", fade(clip.fadeIn, clip.fadeOut, local, len));
        }
      }
      // titles
      const k = cw / W;
      for (const tr of seq.tracks) {
        if (tr.kind !== "text" || tr.hidden) continue;
        for (const clip of tr.clips) {
          if (!isText(clip)) continue;
          const local = t - clip.start;
          if (local < 0 || local >= clip.duration) continue;
          const s = clip.style;
          const fam = s.font && s.font !== "default" && fontsLoaded.current.has(s.font) ? `"tlf-${s.font}"` : "Arial, Helvetica, sans-serif";
          const weight = s.font && s.font !== "default" ? "normal" : s.bold === false ? "normal" : "bold";
          const size = s.size * k;
          tx.font = `${weight} ${size}px ${fam}`;
          tx.textAlign = s.align as CanvasTextAlign;
          tx.textBaseline = "middle";
          tx.fillStyle = s.color;
          tx.globalAlpha = fade(clip.fadeIn, clip.fadeOut, local, clip.duration);
          if (s.shadow) { tx.shadowColor = "rgba(0,0,0,.67)"; tx.shadowOffsetX = 3 * k; tx.shadowOffsetY = 3 * k; }
          const lines = clip.text.split("\n");
          lines.forEach((line, i) => tx.fillText(line, s.x * cw, s.y * ch + (i - (lines.length - 1) / 2) * size * 1.15));
          tx.shadowColor = "transparent";
          tx.globalAlpha = 1;
          drewText = true;
        }
      }
    } else if (p.media) {
      addVideo(p.media, t, "contain", 1);
    }

    const note = notes.find(Boolean);
    if (note && !layers.length) {
      tx.fillStyle = note.includes("offline") ? "#EBB9BA" : "#B4AD7F";
      tx.font = `bold ${Math.round(cw / 20)}px -apple-system, Arial, sans-serif`;
      tx.textAlign = "center"; tx.textBaseline = "middle";
      tx.fillText(note, cw / 2, ch / 2);
      drewText = true;
    }
    c.render(bg, layers, drewText);

    // scrub latency: from the first render that lacked the exact frame to the one that had it
    const s = stats.current;
    s.renders++;
    if (anyExactMissing && !s.pendingSince) s.pendingSince = performance.now();
    if (!anyExactMissing && s.pendingSince) { s.latencies.push(performance.now() - s.pendingSince); if (s.latencies.length > 200) s.latencies.shift(); s.pendingSince = 0; }
    (window.__viewers ||= {})[p.kind] = { ...s, time: t, exactNow: !anyExactMissing, layers: layers.length, layerInfo: layers.map((l) => ({ w: l.width, h: l.height, fit: l.fit, alpha: Math.round(l.alpha * 1000) / 1000 })), engine: engine.stats(), canvas: [cw, ch] };
    if (fb.join() !== fallbacks.join()) setFallbacks(fb);
    // (no polling while a frame decodes: the engine calls back when it lands)
  }

  const isSource = props.kind === "source";
  return (
    <div className={`viewer ${props.kind} ${active ? "active" : ""}`} onPointerDown={onActivate}>
      <div className="viewer-label">{isSource ? `Source${props.media ? ` · ${mediaName(props.media)}` : ""}` : "Program"}</div>
      <div className="viewer-stage" ref={wrapRef}>
        <canvas ref={canvasRef} data-testid={`viewer-${props.kind}`} />
        {isSource && !props.media && <div className="viewer-empty">Click a clip in Media to view it here</div>}
        {error && <div className="viewer-empty">The viewer needs WebGL2: {error}</div>}
      </div>
      {quality === "full" && fallbacks.length > 0 && (
        <div className="preview-note">Full quality can't play {fallbacks.slice(0, 2).join(", ")} live on this computer, so it plays the preview; paused frames are still exact full-quality stills.</div>
      )}
    </div>
  );
}
