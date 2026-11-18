import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  clipLength, clipEnd, isTextClip, mediaById, moveClip, trimClip, totalDuration,
  addMediaClip, addTrack, deleteTrack, updateTrack,
} from "../lib/model.js";
import { fmtTime, AUTHOR, mediaState } from "../lib/format.js";
import Waveform from "./Waveform.jsx";

const HEADER_W = 168;
const ROW_H = { video: 58, audio: 46, text: 40 };
const SNAP_PX = 8;
const EDGE_PX = 7;

function tickStep(zoom) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s * zoom >= 70) return s;
  return 600;
}

export default function Timeline({ timeline, time, seek, zoom, setZoom, selected, setSelected, readOnly, commit, lastChange, setNotice, mediaStatus = {} }) {
  const [draft, setDraft] = useState(null); // timeline shown while dragging
  const drag = useRef(null);
  const scroller = useRef(null);
  const tl = draft || timeline;
  const duration = totalDuration(tl);
  const width = Math.max((duration + 10) * zoom, 800);
  const flashFresh = lastChange && Date.now() - lastChange.at < 3500;
  const flashIds = useMemo(() => new Set(flashFresh ? lastChange.clipIds : []), [lastChange, flashFresh]);

  // keep the playhead in view
  useEffect(() => {
    const el = scroller.current;
    if (!el || drag.current) return;
    const x = time * zoom;
    const view = el.clientWidth - HEADER_W;
    if (x < el.scrollLeft || x > el.scrollLeft + view - 40) el.scrollLeft = Math.max(0, x - view * 0.2);
  }, [time, zoom]);

  const xToTime = (clientX) => {
    const el = scroller.current;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left - HEADER_W + el.scrollLeft) / zoom);
  };

  const snapPoints = (excludeId) => {
    const pts = [0, time];
    for (const t of timeline.tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
    return pts;
  };
  const snap = (value, pts) => {
    let best = value;
    let dist = SNAP_PX / zoom;
    for (const p of pts) if (Math.abs(p - value) < dist) [best, dist] = [p, Math.abs(p - value)];
    return best;
  };

  // ---- clip drag: move / trim -------------------------------------------------------------

  const onClipDown = (e, clip, track) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(clip.id);
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fromLeft = e.clientX - rect.left;
    const fromRight = rect.right - e.clientX;
    const mode = fromLeft < EDGE_PX ? "trimStart" : fromRight < EDGE_PX ? "trimEnd" : "move";
    drag.current = { mode, clipId: clip.id, trackId: track.id, kind: track.kind, x0: e.clientX, start0: clip.start, len: clipLength(clip), moved: false, pts: snapPoints(clip.id), draft: null };
    // listen on window: the clip remounts when it moves to another track
    const move = (ev) => onClipMove(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onClipUp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onClipMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 3 && d.mode === "move") {
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-track]");
      if (!row || row.dataset.track === d.trackId) return;
    }
    d.moved = true;
    let next = null;
    if (d.mode === "move") {
      let start = d.start0 + dx / zoom;
      const snappedStart = snap(start, d.pts);
      const snappedEnd = snap(start + d.len, d.pts) - d.len;
      start = Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start) ? snappedStart : snappedEnd;
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-track]");
      const target = row && row.dataset.kind === d.kind ? row.dataset.track : null;
      next = moveClip(timeline, d.clipId, start, target || undefined) || (target ? moveClip(timeline, d.clipId, start) : null);
    } else {
      const t = snap(xToTime(e.clientX), d.pts);
      next = trimClip(timeline, d.clipId, d.mode === "trimStart" ? "start" : "end", t);
    }
    if (next) {
      d.draft = next;
      setDraft(next);
    }
  };

  const onClipUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && d.draft) commit(d.draft);
    setDraft(null);
  };

  // ---- ruler scrubbing ---------------------------------------------------------------------

  const onRulerDown = (e) => {
    seek(xToTime(e.clientX));
    const move = (ev) => seek(xToTime(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- drop from the media bin -------------------------------------------------------------

  const onDrop = (e, track) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("application/x-media-id");
    if (!mediaId || readOnly) return;
    const m = mediaById(timeline, mediaId);
    const wantKind = m?.kind === "audio" ? "audio" : "video";
    if (track.kind !== wantKind) {
      setNotice(`${m?.file.split("/").pop()} goes on ${wantKind === "audio" ? "an audio" : "a video"} track.`);
      return;
    }
    if (!mediaState(mediaStatus[mediaId]).ready) {
      setNotice(`${m?.file.split("/").pop()} isn't ready yet: you can use it once its proxy is made.`);
      return;
    }
    const r = addMediaClip(timeline, mediaId, track.id, xToTime(e.clientX));
    if (r) {
      commit(r.timeline);
      setSelected(r.clipId);
    }
  };

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(400, Math.max(5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  const step = tickStep(zoom);
  const ticks = [];
  for (let t = 0; t <= duration + 10; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const fps = tl.settings.fps;

  return (
    <section className="timeline">
      <div className="timeline-scroll" ref={scroller} onWheel={onWheel} onPointerDown={() => setSelected(null)}>
        <div className="timeline-inner" style={{ width: width + HEADER_W }}>
          <div className="ruler-row">
            <div className="track-header ruler-corner" style={{ width: HEADER_W }}>
              <span className="muted">⌘/Ctrl + scroll to zoom</span>
            </div>
            <div className="ruler" style={{ width }} onPointerDown={(e) => { e.stopPropagation(); onRulerDown(e); }}>
              {ticks.map((t) => (
                <div key={t} className="tick" style={{ left: t * zoom }}><span>{fmtTime(t, fps).replace(/\.00$/, "")}</span></div>
              ))}
            </div>
          </div>

          {tl.tracks.map((track) => (
            <div key={track.id} className={`track-row kind-${track.kind}`} style={{ height: ROW_H[track.kind] }}>
              <div className="track-header" style={{ width: HEADER_W }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="track-name"><span className={`kind-dot ${track.kind}`} />{track.name} <span className="muted">{track.id}</span></div>
                <div className="track-btns">
                  {track.kind !== "audio" && (
                    <button className={track.hidden ? "on" : ""} disabled={readOnly} title="Hide" onClick={() => commit(updateTrack(timeline, track.id, { hidden: !track.hidden }))}>{track.hidden ? "hidden" : "👁"}</button>
                  )}
                  {track.kind !== "text" && (
                    <button className={track.muted ? "on" : ""} disabled={readOnly} title="Mute" onClick={() => commit(updateTrack(timeline, track.id, { muted: !track.muted }))}>{track.muted ? "muted" : "🔊"}</button>
                  )}
                  <button disabled={readOnly} title="Delete track" onClick={() => {
                    if (track.clips.length && !confirm(`Delete ${track.name} and its ${track.clips.length} clip(s)?`)) return;
                    commit(deleteTrack(timeline, track.id));
                  }}>✕</button>
                </div>
              </div>
              <div
                className={`track-lane ${track.hidden ? "hidden" : ""} ${track.muted ? "muted-track" : ""}`}
                style={{ width }}
                data-track={track.id}
                data-kind={track.kind}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, track)}
              >
                {track.clips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    track={track}
                    timeline={tl}
                    zoom={zoom}
                    selected={selected === clip.id}
                    status={clip.media ? mediaStatus[clip.media] : null}
                    height={ROW_H[track.kind] - 8}
                    flash={flashIds.has(clip.id) ? lastChange : null}
                    onPointerDown={(e) => onClipDown(e, clip, track)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="track-row add-row">
            <div className="track-header" style={{ width: HEADER_W }}>
              <button disabled={readOnly} onClick={() => commit(addTrack(timeline, "video"))}>+ Video</button>
              <button disabled={readOnly} onClick={() => commit(addTrack(timeline, "audio"))}>+ Audio</button>
              <button disabled={readOnly} onClick={() => commit(addTrack(timeline, "text"))}>+ Text</button>
            </div>
          </div>

          <div className="playhead" style={{ left: HEADER_W + time * zoom }} />
        </div>
      </div>
      <div className="timeline-foot">
        <span className="muted">Drag to move · drag edges to trim · S split · Delete · T title · Space play · ←/→ frame (⇧ 1s)</span>
        <div className="spacer" />
        <label className="zoom">Zoom <input type="range" min="5" max="400" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </div>
    </section>
  );
}

const ClipBlock = React.memo(function ClipBlock({ clip, track, timeline, zoom, selected, flash, status, height, ...handlers }) {
  const len = clipLength(clip);
  const m = isTextClip(clip) ? null : mediaById(timeline, clip.media);
  const name = isTextClip(clip) ? `“${clip.text}”` : m?.file.split("/").pop();
  const st = m ? mediaState(status) : null;
  const showWave = m && status?.jobs?.wave === "done" && (track.kind === "audio" || m.hasAudio);
  const style = { left: clip.start * zoom, width: Math.max(4, len * zoom) };
  if (m && m.kind !== "audio" && track.kind === "video") style.backgroundImage = `url(/thumb/${m.id})`;
  const fadeIn = Math.min(clip.fadeIn || 0, len) * zoom;
  const fadeOut = Math.min(clip.fadeOut || 0, len) * zoom;
  return (
    <div className={`clip clip-${track.kind} ${selected ? "selected" : ""} ${st?.offline ? "is-offline" : ""}`} style={style} {...handlers}
      title={`${clip.id} · ${name}\nstart ${clip.start}s · length ${Math.round(len * 1000) / 1000}s${m ? ` · source ${clip.in}–${clip.out}s` : ""}`}>
      {showWave && (
        <div className={`clip-wave ${track.kind === "video" ? "under" : ""}`}>
          <Waveform mediaId={m.id} cacheKey={status.key} from={clip.in} to={clip.out} width={len * zoom}
            height={track.kind === "video" ? Math.round(height * 0.35) : height - 14} />
        </div>
      )}
      {st && !st.ready && !st.offline && (
        <div className={`clip-status ${st.error ? "error" : ""}`}>
          {st.busy && <div className="bar"><div style={{ width: `${Math.round((st.progress || 0) * 100)}%` }} /></div>}
          <span>{st.label}</span>
        </div>
      )}
      {st?.offline && <div className="clip-offline">OFFLINE</div>}
      {fadeIn > 0 && <div className="fade fade-in" style={{ width: fadeIn }} />}
      {fadeOut > 0 && <div className="fade fade-out" style={{ width: fadeOut }} />}
      <div className="clip-label"><b>{clip.id}</b> {name}</div>
      {track.kind !== "text" && clip.volume !== 1 && <div className="clip-vol">{Math.round(clip.volume * 100)}%</div>}
      <div className="edge left" />
      <div className="edge right" />
      {flash && <div key={flash.at} className="flash" style={{ "--flash": AUTHOR[flash.author]?.color }} />}
    </div>
  );
});
