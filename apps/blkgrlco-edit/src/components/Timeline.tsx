import React, { useEffect, useRef, useState } from "react";
import * as ops from "../edit";
import { fmtTime } from "../api";
import { sequenceDuration, mediaName, type Timeline, type Clip, type Track } from "../../shared/model";
import { ver, type MediaStatus } from "../media";
import type { Transport } from "../engine/transport";

const HEADER_W = 176;
const LANE_H: Record<string, number> = { video: 58, audio: 44, text: 34 };
const SNAP_PX = 8;

function niceStep(zoom: number) {
  // seconds between ruler labels so labels sit ~80px apart
  const target = 80 / zoom;
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s >= target) return s;
  return 600;
}

interface Props {
  tl: Timeline; transport: Transport; selected: string | null; setSelected: (id: string | null) => void;
  zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; onCommit: (tl: Timeline, o?: { select?: string | null }) => void;
  onDropMedia: (mediaId: string, trackId?: string, start?: number) => void; recent: Record<string, string>; status: Record<string, MediaStatus>;
}
type Mode = "move" | "trim-start" | "trim-end";

export default function Timeline({ tl, transport, selected, setSelected, zoom, setZoom, onCommit, onDropMedia, recent, status }: Props) {
  const [draft, setDraft] = useState<Timeline | null>(null); // timeline preview while dragging
  const [dropHint, setDropHint] = useState<{ trackId: string; t: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = draft || tl;
  const seq = ops.activeSeq(view);
  const total = Math.max(sequenceDuration(seq) + 10, 30);
  const width = total * zoom;

  // The playhead follows the transport every frame without re-rendering the timeline:
  // the line and the ruler timecode are moved directly, and the view scrolls to keep it visible.
  const lineRef = useRef<HTMLDivElement>(null);
  const tcRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const place = () => {
      const z = zoomRef.current;
      const t = transport.frameTime();
      if (lineRef.current) lineRef.current.style.left = `${HEADER_W + t * z}px`;
      if (tcRef.current) tcRef.current.textContent = fmtTime(t, true);
      const el = scrollRef.current;
      if (!el) return;
      const x = HEADER_W + t * z;
      if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - HEADER_W - (transport.playing ? 40 : el.clientWidth / 3);
      else if (x < el.scrollLeft + HEADER_W) el.scrollLeft = Math.max(0, x - HEADER_W - 40);
    };
    place();
    return transport.subscribe(place);
  }, [transport, zoom]);
  const setPlayhead = (t: number) => { transport.pause(); transport.seek(t); };

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / zoom);
  };

  // ---------------------------------------------------------------- ruler scrubbing
  const onRulerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setPlayhead(timeAt(e.clientX));
    const move = (ev: PointerEvent) => setPlayhead(timeAt(ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------------------------------------------------------------- clip dragging
  const onClipDown = (e: React.PointerEvent, clip: Clip, track: Track, mode: Mode) => {
    if (e.button !== 0) return;
    if (track.locked) { e.stopPropagation(); setSelected(clip.id); return; }
    e.stopPropagation();
    e.preventDefault();
    setSelected(clip.id);
    const startX = e.clientX;
    const orig = { start: clip.start, end: ops.clipEnd(clip) };
    const points = ops.snapPoints(tl, clip.id, transport.frameTime());
    const thr = SNAP_PX / zoom;
    let moved = false;
    let latest: Timeline | null = null;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) >= 3) moved = true;
      const dt = dx / zoom;
      let next: Timeline;
      if (mode === "move") {
        let s = orig.start + dt;
        const len = orig.end - orig.start;
        const sSnap = ops.snap(s, points, thr);
        const eSnap = ops.snap(s + len, points, thr);
        if (sSnap !== s) s = sSnap;
        else if (eSnap !== s + len) s = eSnap - len;
        const laneEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-track]") as HTMLElement | null;
        const trackId = laneEl?.dataset.track || track.id;
        if (trackId !== track.id) moved = true;
        next = ops.moveClip(tl, clip.id, s, trackId);
      } else if (mode === "trim-start") {
        next = ops.trimClip(tl, clip.id, "start", ops.snap(orig.start + dt, points, thr));
      } else {
        next = ops.trimClip(tl, clip.id, "end", ops.snap(orig.end + dt, points, thr));
      }
      latest = next;
      setDraft(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null);
      if (moved && latest) onCommit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------------------------------------------------------------- media drops
  const onDragOver = (e: React.DragEvent, track: Track) => {
    if (!e.dataTransfer.types.includes("application/x-blkgrlco-media")) return;
    e.preventDefault();
    setDropHint({ trackId: track.id, t: timeAt(e.clientX) });
  };
  const onDrop = (e: React.DragEvent, track: Track) => {
    const id = e.dataTransfer.getData("application/x-blkgrlco-media");
    setDropHint(null);
    if (!id) return;
    e.preventDefault();
    onDropMedia(id, track.id, ops.snap(timeAt(e.clientX), ops.snapPoints(tl, null, transport.frameTime()), SNAP_PX / zoom));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.max(5, Math.min(400, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  const step = niceStep(zoom);
  const ticks = [];
  for (let s = 0; s <= total; s += step) ticks.push(s);

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <span className="label">Timeline</span>
        <button onClick={() => onCommit(ops.addTrack(tl, "video"))}>+ Video</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "audio"))}>+ Audio</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "text"))}>+ Text</button>
        <span className="spacer" />
        <label className="zoom">Zoom <input type="range" min="5" max="400" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </div>
      <div className="tl-scroll" ref={scrollRef} onWheel={onWheel}>
        <div className="tl-inner" style={{ width: HEADER_W + width }}>
          <div className="tl-row ruler-row">
            <div className="tl-head ruler-head" ref={tcRef}>0:00.00</div>
            <div className="ruler" style={{ width }} onPointerDown={onRulerDown}>
              {ticks.map((s) => (
                <div key={s} className="tick" style={{ left: s * zoom }}><span>{fmtTime(s)}</span></div>
              ))}
            </div>
          </div>

          {[...seq.tracks].reverse().map((track) => (
            <div key={track.id} className={`tl-row kind-${track.kind} ${track.locked ? "locked" : ""}`} style={{ height: LANE_H[track.kind] }}>
              <div className="tl-head">
                <div className="track-name" title={track.id}>{track.name}</div>
                <div className="track-btns">
                  {track.kind !== "text" && (
                    <button className={track.muted ? "on" : ""} title="Mute" onClick={() => onCommit(ops.updateTrack(tl, track.id, { muted: !track.muted }))}>M</button>
                  )}
                  {track.kind !== "audio" && (
                    <button className={track.hidden ? "on" : ""} title="Hide" onClick={() => onCommit(ops.updateTrack(tl, track.id, { hidden: !track.hidden }))}>H</button>
                  )}
                  <button className={track.locked ? "on" : ""} title="Lock (no edits on this track)" onClick={() => onCommit(ops.updateTrack(tl, track.id, { locked: !track.locked }))}>L</button>
                  {track.clips.length === 0 && (
                    <button title="Remove empty track" onClick={() => onCommit(ops.removeTrack(tl, track.id))}>×</button>
                  )}
                </div>
              </div>
              <div className={`lane ${dropHint?.trackId === track.id ? "drop" : ""}`} data-track={track.id} style={{ width }}
                onPointerDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setPlayhead(timeAt(e.clientX)); } }}
                onDragOver={(e) => onDragOver(e, track)} onDragLeave={() => setDropHint(null)} onDrop={(e) => onDrop(e, track)}>
                {track.clips.map((clip) => (
                  <Clip key={clip.id} clip={clip} track={track} tl={view} zoom={zoom}
                    selected={clip.id === selected} recent={recent[clip.id]} st={!ops.isText(clip) ? status[clip.media] : undefined}
                    onDown={onClipDown} />
                ))}
                {dropHint?.trackId === track.id && <div className="drop-marker" style={{ left: dropHint.t * zoom }} />}
              </div>
            </div>
          ))}
          <div className="playhead" ref={lineRef} style={{ left: HEADER_W }} />
        </div>
      </div>
    </div>
  );
}

function Clip({ clip, track, tl, zoom, selected, recent, st, onDown }: {
  clip: Clip; track: Track; tl: Timeline; zoom: number; selected: boolean; recent?: string; st?: MediaStatus;
  onDown: (e: React.PointerEvent, clip: Clip, track: Track, mode: Mode) => void;
}) {
  const len = ops.clipLength(clip);
  const m = !ops.isText(clip) ? ops.mediaById(tl, clip.media) : undefined;
  const style: React.CSSProperties = { left: clip.start * zoom, width: Math.max(4, len * zoom) };
  let label: React.ReactNode;
  if (ops.isText(clip)) {
    label = <span className="clip-text">“{clip.text}”</span>;
  } else if (m) {
    // The filmstrip/waveform covers the WHOLE source file, so it's sized to the media's length
    // and shifted by the in-point: the clip shows exactly the frames it plays.
    const full = (m.duration || len) * zoom;
    const inPx = -(clip as any).in * zoom;
    const isAudioView = track.kind === "audio" || m.type === "audio";
    if (isAudioView) {
      if (st?.wave.state === "ready") Object.assign(style, { backgroundImage: `url(/api/media/${m.id}/wave?v=${ver(st.wave)})`, backgroundSize: `${full}px 100%`, backgroundPosition: `${inPx}px 0`, backgroundRepeat: "no-repeat" });
    } else if (m.type === "video" && st?.strip.state === "ready") {
      Object.assign(style, { backgroundImage: `url(/api/media/${m.id}/strip?v=${ver(st.strip)})`, backgroundSize: `${full}px 100%`, backgroundPosition: `${inPx}px 0`, backgroundRepeat: "no-repeat" });
    } else if (st?.thumb.state === "ready") {
      Object.assign(style, { backgroundImage: `url(/api/media/${m.id}/thumb?v=${ver(st.thumb)})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" });
    }
    label = <span className="clip-name">{mediaName(m)}</span>;
  }
  const fadeIn = (clip.fadeIn || 0) * zoom;
  const fadeOut = (clip.fadeOut || 0) * zoom;
  const offline = st && !st.online;
  const preparing = m?.type === "video" && track.kind === "video" && st && st.proxy.state !== "ready" && !offline;
  return (
    <div className={`clip ${track.kind} ${selected ? "selected" : ""} ${recent ? `recent recent-${recent}` : ""} ${!m && !ops.isText(clip) ? "missing" : ""} ${offline ? "offline" : ""}`}
      style={style} onPointerDown={(e) => onDown(e, clip, track, "move")}
      title={`${clip.id}${m ? ` · ${mediaName(m)}` : ""} · ${fmtTime(clip.start, true)}–${fmtTime(clip.start + len, true)} (${len.toFixed(2)}s)`}>
      <div className="clip-label"><b>{clip.id}</b> {label}</div>
      {fadeIn > 0 && <div className="fade in" style={{ width: fadeIn }} />}
      {fadeOut > 0 && <div className="fade out" style={{ width: fadeOut }} />}
      {offline && <div className="clip-flag offline">OFFLINE</div>}
      {preparing && <div className="clip-flag preparing">{st!.proxy.state === "running" ? `preview ${Math.round((st!.proxy.progress || 0) * 100)}%` : st!.proxy.state === "error" ? "preview failed" : "preview queued"}</div>}
      {recent && <div className="who">{recent === "claude" ? "Claude" : recent === "you" ? "you" : "app"}</div>}
      <div className="handle left" onPointerDown={(e) => onDown(e, clip, track, "trim-start")} />
      <div className="handle right" onPointerDown={(e) => onDown(e, clip, track, "trim-end")} />
    </div>
  );
}
