import React, { useEffect, useRef, useState } from "react";
import * as ops from "../edit";
import * as X from "../../shared/editing";
import { fmtTime } from "../api";
import { toTimecode } from "../../shared/timecode";
import { sequenceDuration, mediaName, type Timeline, type Clip, type Track, type MediaClip } from "../../shared/model";
import { ver, type MediaStatus } from "../media";
import type { Transport } from "../engine/transport";

const HEADER_W = 176;
const LANE_H: Record<string, number> = { video: 58, audio: 44, text: 34 };
const SNAP_PX = 8;

export type Tool = "select" | "forward" | "ripple" | "roll" | "blade" | "slip" | "slide" | "hand" | "zoom";
export const TOOLS: { id: Tool; icon: string; label: string; cmd: string }[] = [
  { id: "select", icon: "↖", label: "Selection", cmd: "tool-select" },
  { id: "forward", icon: "⇥", label: "Track select forward (⇧: one track)", cmd: "tool-forward" },
  { id: "ripple", icon: "⟷", label: "Ripple edit: trim and close up", cmd: "tool-ripple" },
  { id: "roll", icon: "⇹", label: "Rolling edit: move a cut", cmd: "tool-roll" },
  { id: "blade", icon: "✂", label: "Blade (⇧: all tracks)", cmd: "tool-blade" },
  { id: "slip", icon: "⇆", label: "Slip: change what plays, not where", cmd: "tool-slip" },
  { id: "slide", icon: "⇄", label: "Slide: move between neighbours", cmd: "tool-slide" },
  { id: "hand", icon: "✋", label: "Hand: scroll", cmd: "tool-hand" },
  { id: "zoom", icon: "🔍", label: "Zoom (⌥: out)", cmd: "tool-zoom" },
];

function niceStep(zoom: number) {
  const target = 80 / zoom;
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s >= target) return s;
  return 600;
}

interface Props {
  tl: Timeline; transport: Transport; selection: string[]; setSelection: (ids: string[]) => void;
  zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; onCommit: (tl: Timeline, o?: { select?: string | null }) => void;
  onDropMedia: (mediaId: string, trackId?: string, start?: number) => void; recent: Record<string, string>; status: Record<string, MediaStatus>;
  tool: Tool; setTool: (t: Tool) => void; snapping: boolean; setSnapping: (v: boolean) => void; linkedSel: boolean; setLinkedSel: (v: boolean) => void;
  onOpenSequence: (id: string) => void; flash: (t: string, k?: string) => void; onLaneClick: (trackId: string) => void; lastTrack: string | null;
  selectedMarker: string | null; setSelectedMarker: (id: string | null) => void; keyFor: (cmd: string) => string;
}
type Part = "body" | "start" | "end";

export default function Timeline(p: Props) {
  const { tl, transport, selection, setSelection, zoom, setZoom, onCommit, onDropMedia, recent, status, tool, snapping } = p;
  const [draft, setDraft] = useState<Timeline | null>(null);
  const [dropHint, setDropHint] = useState<{ trackId: string; t: number } | null>(null);
  const [readout, setReadout] = useState<string | null>(null); // "+00:01:12" while dragging
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = draft || tl;
  const seq = ops.activeSeq(view);
  const total = Math.max(sequenceDuration(seq) + 10, 30);
  const width = total * zoom;
  const sel = new Set(selection);
  const offsets = X.syncOffsets(seq);
  const markers = X.allMarkers(seq);

  const lineRef = useRef<HTMLDivElement>(null);
  const tcRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const place = () => {
      const z = zoomRef.current;
      const t = transport.frameTime();
      if (lineRef.current) lineRef.current.style.left = `${HEADER_W + t * z}px`;
      if (tcRef.current) tcRef.current.textContent = toTimecode(t, seq.fps);
      const el = scrollRef.current;
      if (!el) return;
      const x = HEADER_W + t * z;
      if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - HEADER_W - (transport.playing ? 40 : el.clientWidth / 3);
      else if (x < el.scrollLeft + HEADER_W) el.scrollLeft = Math.max(0, x - HEADER_W - 40);
    };
    place();
    return transport.subscribe(place);
  }, [transport, zoom, seq.fps]);
  const setPlayhead = (t: number) => { transport.pause(); transport.seek(t); };

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / zoom);
  };
  const snapT = (t: number, points: number[]) => (snapping ? ops.snap(t, points, SNAP_PX / zoom) : t);
  /** Snap targets: clip edges (minus the ones being dragged), playhead, markers, In/Out. */
  const pointsFor = (exclude: string[]) => {
    const ex = new Set(exclude);
    const s = ops.activeSeq(tl);
    const out = [0, transport.frameTime(), ...markers.map((k) => k.at)];
    if (s.marks?.in !== undefined) out.push(s.marks.in);
    if (s.marks?.out !== undefined) out.push(s.marks.out);
    for (const t of s.tracks) for (const c of t.clips) if (!ex.has(c.id)) out.push(c.start, ops.clipEnd(c));
    return out;
  };

  /** Generic drag: `apply(dt)` returns the edited timeline for the total delta; the last good one is committed. */
  const drag = (e: React.PointerEvent, apply: (dt: number, ev: PointerEvent) => X.Result | null, label?: (dt: number) => string) => {
    const startX = e.clientX;
    let moved = false;
    let latest: X.Result | null = null;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) >= 3) moved = true;
      if (!moved) return;
      const r = apply(dx / zoom, ev);
      if (r?.ok) { latest = r; setDraft(r.timeline); }
      if (label) setReadout(label(dx / zoom));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null); setReadout(null);
      if (moved && latest) { onCommit(latest.timeline); if (latest.message) p.flash(latest.message, "warn"); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const signed = (dt: number) => `${dt >= 0 ? "+" : "−"}${toTimecode(Math.abs(dt), seq.fps).replace(/^00:/, "")}`;

  // ---------------------------------------------------------------- ruler scrubbing
  const onRulerDown = (e: React.PointerEvent) => {
    if (tool === "hand" || tool === "zoom") return;
    e.preventDefault();
    setPlayhead(timeAt(e.clientX));
    const move = (ev: PointerEvent) => setPlayhead(timeAt(ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------------------------------------------------------------- markers in the ruler
  const onMarkerDown = (e: React.PointerEvent, k: (typeof markers)[number]) => {
    e.stopPropagation(); e.preventDefault();
    p.setSelectedMarker(k.id);
    setPlayhead(k.at);
    if (k.clipId) return; // clip markers move with their clip
    const base = tl;
    drag(e, (dt) => X.updateMarker(base, k.id, { t: Math.max(0, snapT(k.t + dt, pointsFor([]))) }), (dt) => signed(dt));
  };

  // ---------------------------------------------------------------- hand / zoom tools anywhere
  const onScrollDown = (e: React.PointerEvent) => {
    if (tool === "hand" && e.button === 0) {
      e.preventDefault(); e.stopPropagation();
      const el = scrollRef.current!;
      const x0 = e.clientX, y0 = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
      const move = (ev: PointerEvent) => { el.scrollLeft = sl - (ev.clientX - x0); el.scrollTop = st - (ev.clientY - y0); };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    } else if (tool === "zoom" && e.button === 0) {
      e.preventDefault(); e.stopPropagation();
      const t = timeAt(e.clientX);
      const z2 = Math.max(5, Math.min(400, zoom * (e.altKey ? 1 / 1.6 : 1.6)));
      setZoom(z2);
      requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollLeft = Math.max(0, t * z2 - el.clientWidth / 2 + HEADER_W); });
    }
  };

  // ---------------------------------------------------------------- clips
  const onClipDown = (e: React.PointerEvent, clip: Clip, track: Track, part: Part) => {
    if (e.button !== 0 || tool === "hand" || tool === "zoom") return;
    e.stopPropagation();
    e.preventDefault();
    p.onLaneClick(track.id);
    const s = ops.activeSeq(tl);
    const linked = p.linkedSel && !e.altKey;
    const t0 = timeAt(e.clientX);

    if (tool === "blade") {
      const t = snapT(t0, pointsFor([]));
      const tracks = e.shiftKey ? undefined : [...new Set(X.withLinked(s, [clip.id], linked).map((id) => X.locate(s, id)!.track.id))];
      const r = X.blade(tl, t, tracks);
      if (r.ok) onCommit(r.timeline); else p.flash(r.message!);
      return;
    }
    if (tool === "forward") {
      const ids = X.clipsFrom(s, clip.start, e.shiftKey ? track.id : undefined)
        .filter((id) => X.locate(s, id)!.clip.start >= clip.start - 1e-6);
      setSelection(ids);
      return;
    }
    // selection (⇧ adds/removes; linked partners come along unless ⌥)
    const group = X.withLinked(s, [clip.id], linked);
    let nextSel = selection;
    if (e.shiftKey) nextSel = sel.has(clip.id) ? selection.filter((id) => !group.includes(id)) : [...new Set([...selection, ...group])];
    else if (!sel.has(clip.id) || e.altKey) nextSel = group;
    setSelection(nextSel);
    if (track.locked || e.shiftKey) return;
    const base = tl;
    const pts = pointsFor(group);

    if (part !== "body") {
      const edge = part === "start" ? "start" : "end";
      const orig = edge === "start" ? clip.start : ops.clipEnd(clip);
      const snapped = (dt: number) => snapT(orig + dt, pts) - orig;
      if (tool === "ripple") return drag(e, (dt) => X.rippleTrim(base, clip.id, edge, snapped(dt), linked), (dt) => `ripple ${signed(snapped(dt))}`);
      if (tool === "roll") {
        const left = edge === "end" ? clip : track.clips.find((c) => Math.abs(ops.clipEnd(c) - clip.start) < 1e-4);
        if (!left) { p.flash("Roll needs a clip touching this edge."); return; }
        return drag(e, (dt) => X.roll(base, left.id, snapped(dt), linked), (dt) => `roll ${signed(snapped(dt))}`);
      }
      // Selection tool: plain trim, leaves a gap. ⌥ trims only this side (J/L cut).
      return drag(e, (dt) => X.trim(base, clip.id, edge, snapped(dt), linked), (dt) => `trim ${signed(snapped(dt))}`);
    }
    if (tool === "slip") return drag(e, (dt) => X.slip(base, clip.id, -dt, linked), (dt) => `slip ${signed(-dt)}`);
    if (tool === "slide") return drag(e, (dt) => X.slide(base, clip.id, snapT(clip.start + dt, pts) - clip.start, linked), (dt) => `slide ${signed(dt)}`);
    if (tool === "ripple" || tool === "roll") return;
    // move: everything selected moves together; the grabbed clip can change track
    const moving = sel.has(clip.id) && !e.altKey ? nextSel : group;
    const len = ops.clipEnd(clip) - clip.start;
    const baseSeq = ops.activeSeq(base);
    drag(e, (dt, ev) => {
      let st = Math.max(0, clip.start + dt);
      if (snapping) {
        const a = ops.snap(st, pts, SNAP_PX / zoom), b = ops.snap(st + len, pts, SNAP_PX / zoom);
        if (a !== st) st = a; else if (b !== st + len) st = b - len;
      }
      const d = st - clip.start;
      const laneEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-track]") as HTMLElement | null;
      const toTrack = laneEl?.dataset.track;
      const next = ops.moveClip(base, clip.id, st, toTrack && toTrack !== track.id ? toTrack : undefined);
      const ns = ops.activeSeq(next);
      for (const id of moving) {
        if (id === clip.id) continue;
        const f = X.locate(ns, id), o = X.locate(baseSeq, id);
        if (!f || !o || f.track.locked) continue;
        f.clip.start = ops.r6(Math.max(0, o.clip.start + d));
      }
      return { ok: true, timeline: next };
    }, (dt) => signed(dt));
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
    onDropMedia(id, track.id, snapT(timeAt(e.clientX), pointsFor([])));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.max(5, Math.min(400, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  const step = niceStep(zoom);
  const ticks = [];
  for (let s = 0; s <= total; s += step) ticks.push(s);
  const marks = seq.marks;
  const hasRange = !!marks && (marks.in !== undefined || marks.out !== undefined);
  const upd = (track: Track, patch: Partial<Track>) => onCommit(ops.updateTrack(tl, track.id, patch));

  return (
    <div className={`timeline tool-${tool}`}>
      <div className="tl-toolbar">
        <div className="toolbox" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? "on" : ""} data-tool={t.id} title={`${t.label} (${p.keyFor(t.cmd)})`} onClick={() => p.setTool(t.id)}>{t.icon}</button>
          ))}
        </div>
        <button className={`toggle ${snapping ? "on" : ""}`} onClick={() => p.setSnapping(!snapping)} title={`Snapping (${p.keyFor("snap")})`} data-testid="snap">🧲 Snap</button>
        <button className={`toggle ${p.linkedSel ? "on" : ""}`} onClick={() => p.setLinkedSel(!p.linkedSel)} title={`Linked selection: picture and its sound move together (${p.keyFor("linked-selection")}); hold ⌥ to grab one side`}>⛓ Linked</button>
        <span className="sep" />
        <button onClick={() => onCommit(ops.addTrack(tl, "video"))}>+ Video</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "audio"))}>+ Audio</button>
        <button onClick={() => onCommit(ops.addTrack(tl, "text"))}>+ Text</button>
        <span className="spacer" />
        {readout && <span className="readout">{readout}</span>}
        {hasRange && (
          <span className="marks-readout" title="Timeline In / Out (I, O; ⌥X clears)">In {marks!.in !== undefined ? toTimecode(marks!.in, seq.fps) : "—"} · Out {marks!.out !== undefined ? toTimecode(marks!.out, seq.fps) : "—"}</span>
        )}
        <label className="zoom">Zoom <input type="range" min="5" max="400" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </div>
      <div className="tl-scroll" ref={scrollRef} onWheel={onWheel} onPointerDownCapture={onScrollDown}>
        <div className="tl-inner" style={{ width: HEADER_W + width }}>
          <div className="tl-row ruler-row">
            <div className="tl-head ruler-head" ref={tcRef}>00:00:00:00</div>
            <div className="ruler" style={{ width }} onPointerDown={onRulerDown}>
              {ticks.map((s) => (
                <div key={s} className="tick" style={{ left: s * zoom }}><span>{fmtTime(s)}</span></div>
              ))}
              {hasRange && <div className="tl-range" style={{ left: (marks!.in ?? 0) * zoom, width: Math.max(2, ((marks!.out ?? total) - (marks!.in ?? 0)) * zoom) }} />}
              {markers.map((k) => (
                <div key={k.id} className={`marker ${k.type} ${k.clipId ? "on-clip" : ""} ${p.selectedMarker === k.id ? "on" : ""} ${k.done ? "done" : ""} ${k.duration ? "range" : ""}`} data-marker={k.id}
                  style={{ left: k.at * zoom, ["--mc" as any]: X.MARKER_COLORS[k.color], width: k.duration ? k.duration * zoom : undefined }}
                  title={`${k.type === "claude" ? "For Claude: " : k.type === "chapter" ? "Chapter: " : ""}${k.name || "(marker)"}${k.note ? ` — ${k.note}` : ""} · ${toTimecode(k.at, seq.fps)}`}
                  onPointerDown={(e) => onMarkerDown(e, k)}>
                  <span className="flag">{k.type === "claude" ? "✦" : k.type === "chapter" ? "§" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {[...seq.tracks].reverse().map((track) => (
            <div key={track.id} className={`tl-row kind-${track.kind} ${track.locked ? "locked" : ""} ${p.lastTrack === track.id ? "focus" : ""}`} style={{ height: LANE_H[track.kind] }}>
              <div className="tl-head">
                {track.kind !== "text" && (
                  <button className={`target ${track.targeted ? "on" : ""}`} data-testid={`target-${track.id}`}
                    title={track.targeted ? "Targeted: Insert/Overwrite put the source here. Click to untarget." : "Click to target: Insert/Overwrite put the source here"}
                    onClick={() => {
                      // one target per kind, like Premiere's source patching
                      const next = structuredClone(tl);
                      for (const t of ops.activeSeq(next).tracks) if (t.kind === track.kind) t.targeted = t.id === track.id ? !track.targeted : false;
                      onCommit(next);
                    }}>{track.id.toUpperCase()}</button>
                )}
                <div className="track-name" title={track.id}>{track.name}</div>
                <div className="track-btns">
                  <button className={`sync ${track.syncLock !== false ? "on" : ""}`} data-testid={`sync-${track.id}`} title={track.syncLock !== false ? "Sync lock on: ripple edits shift this track too, keeping it in sync" : "Sync lock off: ripple edits leave this track alone"} onClick={() => upd(track, { syncLock: track.syncLock === false })}>⛓</button>
                  {track.kind !== "text" && <button className={track.muted ? "on" : ""} title="Mute" onClick={() => upd(track, { muted: !track.muted })}>M</button>}
                  {track.kind !== "audio" && <button className={track.hidden ? "on" : ""} title="Hide" onClick={() => upd(track, { hidden: !track.hidden })}>H</button>}
                  <button className={track.locked ? "on" : ""} title="Lock (no edits on this track)" onClick={() => upd(track, { locked: !track.locked })}>L</button>
                  {track.clips.length === 0 && <button title="Remove empty track" onClick={() => onCommit(ops.removeTrack(tl, track.id))}>×</button>}
                </div>
              </div>
              <div className={`lane ${dropHint?.trackId === track.id ? "drop" : ""}`} data-track={track.id} style={{ width }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget || tool === "hand" || tool === "zoom") return;
                  p.onLaneClick(track.id);
                  if (!e.shiftKey) setSelection([]);
                  p.setSelectedMarker(null);
                  setPlayhead(timeAt(e.clientX));
                }}
                onDragOver={(e) => onDragOver(e, track)} onDragLeave={() => setDropHint(null)} onDrop={(e) => onDrop(e, track)}>
                {track.clips.map((clip) => (
                  <ClipView key={clip.id} clip={clip} track={track} tl={view} zoom={zoom} offset={offsets[clip.id]}
                    selected={sel.has(clip.id)} recent={recent[clip.id]} st={ops.isMediaClip(clip) ? status[clip.media] : undefined}
                    onDown={onClipDown} onOpen={p.onOpenSequence} />
                ))}
                {dropHint?.trackId === track.id && <div className="drop-marker" style={{ left: dropHint.t * zoom }} />}
              </div>
            </div>
          ))}
          {hasRange && <div className="tl-range-lanes" style={{ left: HEADER_W + (marks!.in ?? 0) * zoom, width: Math.max(2, ((marks!.out ?? total) - (marks!.in ?? 0)) * zoom) }} />}
          <div className="playhead" ref={lineRef} style={{ left: HEADER_W }} />
        </div>
      </div>
    </div>
  );
}

function ClipView({ clip, track, tl, zoom, selected, recent, st, offset, onDown, onOpen }: {
  clip: Clip; track: Track; tl: Timeline; zoom: number; selected: boolean; recent?: string; st?: MediaStatus; offset?: number;
  onDown: (e: React.PointerEvent, clip: Clip, track: Track, part: Part) => void; onOpen: (seqId: string) => void;
}) {
  const len = ops.clipLength(clip);
  const m = ops.isMediaClip(clip) ? ops.mediaById(tl, clip.media) : undefined;
  const nested = ops.isNested(clip) ? tl.sequences.find((s) => s.id === clip.seq) : undefined;
  const style: React.CSSProperties = { left: clip.start * zoom, width: Math.max(4, len * zoom) };
  let label: React.ReactNode;
  if (ops.isText(clip)) {
    label = <span className="clip-text">“{clip.text}”</span>;
  } else if (ops.isNested(clip)) {
    label = <span className="clip-name">▣ {nested?.name || `missing ${clip.seq}`}</span>;
  } else if (m) {
    // The filmstrip/waveform covers the WHOLE source, sized to its length and shifted by the in-point.
    const full = (m.duration || len) * zoom;
    const inPx = -(clip as MediaClip).in * zoom;
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
  const link = !ops.isText(clip) ? (clip as MediaClip).link : undefined;
  const cms = !ops.isText(clip) ? (clip as MediaClip).markers || [] : [];
  return (
    <div className={`clip ${track.kind} ${nested ? "nested" : ""} ${selected ? "selected" : ""} ${recent ? `recent recent-${recent}` : ""} ${!m && !ops.isText(clip) && !nested ? "missing" : ""} ${offline ? "offline" : ""}`}
      data-clip={clip.id} style={style} onPointerDown={(e) => onDown(e, clip, track, "body")}
      onDoubleClick={() => nested && onOpen(nested.id)}
      title={`${clip.id}${m ? ` · ${mediaName(m)}` : ""}${nested ? ` · nested ${nested.name} (double-click to open)` : ""}${link ? ` · linked (${link})` : ""} · ${fmtTime(clip.start, true)}–${fmtTime(clip.start + len, true)} (${len.toFixed(2)}s)`}>
      <div className="clip-label"><b>{clip.id}</b>{link && <span className="linked" title="Linked picture + sound"> ⛓</span>} {label}</div>
      {offset !== undefined && <div className="sync-badge" title={`Out of sync with its linked clip by ${offset} frames`}>{offset > 0 ? "+" : ""}{offset}</div>}
      {fadeIn > 0 && <div className="fade in" style={{ width: fadeIn }} />}
      {fadeOut > 0 && <div className="fade out" style={{ width: fadeOut }} />}
      {cms.map((k) => {
        const x = (k.t - (clip as MediaClip).in) * zoom;
        return x >= 0 && x <= len * zoom ? <div key={k.id} className="clip-marker" style={{ left: x, background: X.MARKER_COLORS[k.color] }} title={k.name} /> : null;
      })}
      {offline && <div className="clip-flag offline">OFFLINE</div>}
      {preparing && <div className="clip-flag preparing">{st!.proxy.state === "running" ? `preview ${Math.round((st!.proxy.progress || 0) * 100)}%` : st!.proxy.state === "error" ? "preview failed" : "preview queued"}</div>}
      {recent && <div className="who">{recent === "claude" ? "Claude" : recent === "you" ? "you" : "app"}</div>}
      <div className="handle left" onPointerDown={(e) => onDown(e, clip, track, "start")} />
      <div className="handle right" onPointerDown={(e) => onDown(e, clip, track, "end")} />
    </div>
  );
}
