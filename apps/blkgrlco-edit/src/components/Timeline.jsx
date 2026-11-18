import React, { useEffect, useRef, useState } from "react";
import * as ops from "../ops.js";
import { fmtTime } from "../api.js";
import { timelineDuration } from "../../server/timeline.js";

const HEADER_W = 150;
const LANE_H = { video: 58, audio: 44, text: 34 };
const SNAP_PX = 8;

function niceStep(zoom) {
  // seconds between ruler labels so labels sit ~80px apart
  const target = 80 / zoom;
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s >= target) return s;
  return 600;
}

export default function Timeline({ tl, playhead, setPlayhead, selected, setSelected, zoom, setZoom, onCommit, onDropMedia, recent, assetBump }) {
  const [draft, setDraft] = useState(null); // timeline preview while dragging
  const [dropHint, setDropHint] = useState(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const view = draft || tl;
  const total = Math.max(timelineDuration(view) + 10, 30);
  const width = total * zoom;

  // Keep the playhead in view while it moves past the right edge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = HEADER_W + playhead * zoom;
    if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - HEADER_W - 40;
    else if (x < el.scrollLeft + HEADER_W) el.scrollLeft = Math.max(0, x - HEADER_W - 40);
  }, [playhead, zoom]);

  const timeAt = (clientX) => {
    const el = scrollRef.current;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / zoom);
  };

  // ---------------------------------------------------------------- ruler scrubbing
  const onRulerDown = (e) => {
    e.preventDefault();
    setPlayhead(timeAt(e.clientX));
    const move = (ev) => setPlayhead(timeAt(ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------------------------------------------------------------- clip dragging
  const onClipDown = (e, clip, track, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(clip.id);
    const startX = e.clientX;
    const orig = { start: clip.start, end: ops.clipEnd(clip) };
    const points = ops.snapPoints(tl, clip.id, playhead);
    const thr = SNAP_PX / zoom;
    let moved = false;
    let latest = null;
    dragRef.current = true;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3 && mode !== "move-y") moved = false;
      if (Math.abs(dx) >= 3) moved = true;
      const dt = dx / zoom;
      let next;
      if (mode === "move") {
        let s = orig.start + dt;
        const len = orig.end - orig.start;
        const sSnap = ops.snap(s, points, thr);
        const eSnap = ops.snap(s + len, points, thr);
        if (sSnap !== s) s = sSnap;
        else if (eSnap !== s + len) s = eSnap - len;
        const laneEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-track]");
        const trackId = laneEl?.dataset.track || track.id;
        if (trackId !== track.id) moved = true;
        next = ops.moveClip(tl, clip.id, { start: s, trackId });
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
      dragRef.current = false;
      setDraft(null);
      if (moved && latest) onCommit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------------------------------------------------------------- media drops
  const onDragOver = (e, track) => {
    if (!e.dataTransfer.types.includes("application/x-blkgrlco-media")) return;
    e.preventDefault();
    setDropHint({ trackId: track.id, t: timeAt(e.clientX) });
  };
  const onDrop = (e, track) => {
    const id = e.dataTransfer.getData("application/x-blkgrlco-media");
    setDropHint(null);
    if (!id) return;
    e.preventDefault();
    onDropMedia(id, track.id, ops.snap(timeAt(e.clientX), ops.snapPoints(tl, null, playhead), SNAP_PX / zoom));
  };

  const onWheel = (e) => {
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
        <button onClick={() => onCommit(ops.addTrack(tl, "video"))}>+ Video track</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "audio"))}>+ Audio track</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "text"))}>+ Text track</button>
        <span className="spacer" />
        <label className="zoom">Zoom <input type="range" min="5" max="400" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </div>
      <div className="tl-scroll" ref={scrollRef} onWheel={onWheel}>
        <div className="tl-inner" style={{ width: HEADER_W + width }}>
          <div className="tl-row ruler-row">
            <div className="tl-head ruler-head">{fmtTime(playhead, true)}</div>
            <div className="ruler" style={{ width }} onPointerDown={onRulerDown}>
              {ticks.map((s) => (
                <div key={s} className="tick" style={{ left: s * zoom }}><span>{fmtTime(s)}</span></div>
              ))}
            </div>
          </div>

          {[...view.tracks].reverse().map((track) => (
            <div key={track.id} className={`tl-row kind-${track.kind}`} style={{ height: LANE_H[track.kind] }}>
              <div className="tl-head">
                <div className="track-name" title={track.id}>{track.name}</div>
                <div className="track-btns">
                  {track.kind !== "text" && (
                    <button className={track.muted ? "on" : ""} title="Mute" onClick={() => onCommit(ops.updateTrack(tl, track.id, { muted: !track.muted }))}>M</button>
                  )}
                  {track.kind !== "audio" && (
                    <button className={track.hidden ? "on" : ""} title="Hide" onClick={() => onCommit(ops.updateTrack(tl, track.id, { hidden: !track.hidden }))}>H</button>
                  )}
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
                    selected={clip.id === selected} recent={recent[clip.id]} assetBump={assetBump}
                    onDown={onClipDown} />
                ))}
                {dropHint?.trackId === track.id && <div className="drop-marker" style={{ left: dropHint.t * zoom }} />}
              </div>
            </div>
          ))}
          <div className="playhead" style={{ left: HEADER_W + playhead * zoom }} />
        </div>
      </div>
    </div>
  );
}

function Clip({ clip, track, tl, zoom, selected, recent, assetBump, onDown }) {
  const len = ops.clipDuration(clip);
  const m = clip.media ? ops.mediaById(tl, clip.media) : null;
  const style = { left: clip.start * zoom, width: Math.max(4, len * zoom) };
  let label;
  if (clip.text !== undefined) {
    label = <span className="clip-text">“{clip.text}”</span>;
  } else if (m) {
    const isAudioView = track.kind === "audio" || m.type === "audio";
    if (isAudioView) {
      const full = (m.duration || len) * zoom;
      Object.assign(style, {
        backgroundImage: `url(/api/wave/${m.id}?v=${assetBump})`,
        backgroundSize: `${full}px 100%`,
        backgroundPosition: `${-clip.in * zoom}px 0`,
        backgroundRepeat: "no-repeat",
      });
    } else {
      Object.assign(style, { backgroundImage: `url(/api/thumb/${m.id}?v=${assetBump})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" });
    }
    label = <span className="clip-name">{m.file}</span>;
  }
  const fadeIn = (clip.fadeIn || 0) * zoom;
  const fadeOut = (clip.fadeOut || 0) * zoom;
  return (
    <div className={`clip ${track.kind} ${selected ? "selected" : ""} ${recent ? `recent recent-${recent}` : ""} ${!m && clip.text === undefined ? "missing" : ""}`}
      style={style} onPointerDown={(e) => onDown(e, clip, track, "move")}
      title={`${clip.id}${m ? ` · ${m.file}` : ""} · ${fmtTime(clip.start, true)}–${fmtTime(clip.start + len, true)} (${len.toFixed(2)}s)`}>
      <div className="clip-label"><b>{clip.id}</b> {label}</div>
      {fadeIn > 0 && <div className="fade in" style={{ width: fadeIn }} />}
      {fadeOut > 0 && <div className="fade out" style={{ width: fadeOut }} />}
      {recent && <div className="who">{recent === "claude" ? "Claude" : recent === "you" ? "you" : "app"}</div>}
      <div className="handle left" onPointerDown={(e) => onDown(e, clip, track, "trim-start")} />
      <div className="handle right" onPointerDown={(e) => onDown(e, clip, track, "trim-end")} />
    </div>
  );
}
