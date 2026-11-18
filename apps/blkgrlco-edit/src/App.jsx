import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connect, getState, putTimeline, post, fmtTime } from "./api.js";
import * as ops from "./ops.js";
import { timelineDuration } from "../server/timeline.js";
import Timeline from "./components/Timeline.jsx";
import Preview from "./components/Preview.jsx";
import MediaBin from "./components/MediaBin.jsx";
import Inspector from "./components/Inspector.jsx";
import Activity from "./components/Activity.jsx";

const HIGHLIGHT_MS = 6000;

export default function App() {
  const [tl, setTl] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [fileError, setFileError] = useState(null);
  const [activity, setActivity] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [mediaStates, setMediaStates] = useState({});
  const [assetBump, setAssetBump] = useState(0);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60); // px per second
  const [exportState, setExportState] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const revRef = useRef(0);
  const tlRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const queueRef = useRef(Promise.resolve());

  tlRef.current = tl;
  const duration = useMemo(() => (tl ? timelineDuration(tl) : 0), [tl]);

  const flash = (text, kind = "info") => {
    setToast({ text, kind });
    clearTimeout(flash.t);
    flash.t = setTimeout(() => setToast(null), 4000);
  };

  // ------------------------------------------------------------ load + live updates
  useEffect(() => {
    getState().then((s) => {
      setTl(s.timeline);
      revRef.current = s.revision;
      setWarnings(s.warnings || []);
      setFileError(s.fileError);
      setActivity(s.activity || []);
      setFonts(s.fonts || []);
      setMediaStates(s.mediaStates || {});
    });
    return connect((msg) => {
      if (msg.type === "timeline") {
        revRef.current = msg.revision;
        setTl(msg.timeline);
        setWarnings(msg.warnings || []);
        setFileError(null);
        if (msg.entry) setActivity((a) => [...a.slice(-299), msg.entry]);
        if (msg.author !== "you") {
          // Someone else changed the file: local undo history no longer applies.
          undoRef.current = [];
          redoRef.current = [];
        }
      } else if (msg.type === "file-error") setFileError(msg.message);
      else if (msg.type === "media-status") setMediaStates((m) => ({ ...m, [msg.id]: msg.state }));
      else if (msg.type === "media-asset") setAssetBump((n) => n + 1);
      else if (msg.type === "export") setExportState(msg);
      else if (msg.type === "hello" && msg.revision !== revRef.current && revRef.current) {
        getState().then((s) => { setTl(s.timeline); revRef.current = s.revision; setActivity(s.activity || []); });
      }
    }, setConnected);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ------------------------------------------------------------ committing edits
  const send = useCallback((next) => {
    queueRef.current = queueRef.current.then(async () => {
      const { status, body } = await putTimeline(next, revRef.current);
      if (status === 409) {
        setTl(body.timeline);
        revRef.current = body.revision;
        undoRef.current = [];
        flash(body.error, "warn");
      } else if (status !== 200) {
        flash(body.error || "Couldn't save that change.", "error");
        getState().then((s) => { setTl(s.timeline); revRef.current = s.revision; });
      } else revRef.current = Math.max(revRef.current, body.revision);
    }).catch(() => flash("Lost connection to the server.", "error"));
  }, []);

  const commit = useCallback((next) => {
    const prev = tlRef.current;
    if (!next || next === prev) return;
    undoRef.current.push(prev);
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
    setTl(next);
    send(next);
  }, [send]);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return flash("Nothing to undo.");
    redoRef.current.push(tlRef.current);
    setTl(prev);
    send(prev);
  }, [send]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(tlRef.current);
    setTl(next);
    send(next);
  }, [send]);

  // ------------------------------------------------------------ playback clock
  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      setPlayhead((p) => {
        const n = p + dt;
        if (n >= duration) { setPlaying(false); return duration; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && playhead >= duration - 0.01) setPlayhead(0);
      return !p;
    });
  }, [playhead, duration]);

  // ------------------------------------------------------------ actions
  // Split the selected clip at the playhead; with nothing selected (or the playhead
  // outside it), split every clip under the playhead on every track.
  const splitAtPlayhead = useCallback(() => {
    let cur = tlRef.current;
    const sel = selected && ops.findClip(cur, selected);
    const targets = sel && playhead > sel.clip.start && playhead < ops.clipEnd(sel.clip)
      ? [sel.clip.id]
      : ops.clipsAt(cur, playhead).map((h) => h.clip.id);
    if (!targets.length) return flash("Put the playhead over a clip to split it.");
    let lastNew = null;
    for (const id of targets) {
      const r = ops.splitClip(cur, id, playhead);
      if (r.newId) { cur = r.timeline; lastNew = r.newId; }
    }
    if (lastNew) { commit(cur); if (sel) setSelected(lastNew); }
  }, [selected, playhead, commit]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    commit(ops.deleteClip(tlRef.current, selected));
    setSelected(null);
  }, [selected, commit]);

  const addText = useCallback(() => {
    const textTrack = tlRef.current.tracks.find((t) => t.kind === "text");
    const { timeline, clipId } = ops.addTextClip(tlRef.current, { trackId: textTrack?.id, start: playhead });
    commit(timeline);
    setSelected(clipId);
  }, [playhead, commit]);

  const addMedia = useCallback((mediaId, trackId, start) => {
    const cur = tlRef.current;
    const m = ops.mediaById(cur, mediaId);
    if (!m) return;
    let track = trackId ? cur.tracks.find((t) => t.id === trackId) : null;
    if (!track || !ops.acceptsMedia(track.kind, m.type)) {
      track = cur.tracks.find((t) => ops.acceptsMedia(t.kind, m.type) && (m.type !== "video" || t.kind === "video"));
    }
    if (!track) return flash(`No ${m.type === "audio" ? "audio" : "video"} track to put that on.`);
    // default position: the end of that track
    const at = start ?? track.clips.reduce((e, c) => Math.max(e, ops.clipEnd(c)), 0);
    const { timeline, clipId } = ops.addMediaClip(cur, { mediaId, trackId: track.id, start: at });
    if (clipId) { commit(timeline); setSelected(clipId); }
  }, [commit]);

  const startExport = async () => {
    const r = await post("/api/export");
    if (r.error) flash(r.error, "warn");
  };

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const fps = tlRef.current?.project.fps || 30;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.key === "s" || e.key === "S") splitAtPlayhead();
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlayhead((p) => Math.max(0, p - (e.shiftKey ? 1 : 1 / fps))); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlayhead((p) => p + (e.shiftKey ? 1 : 1 / fps)); }
      else if (e.key === "Home") setPlayhead(0);
      else if (e.key === "End") setPlayhead(duration);
      else if (e.key === "=" || e.key === "+") setZoom((z) => Math.min(400, z * 1.25));
      else if (e.key === "-") setZoom((z) => Math.max(5, z / 1.25));
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, undo, redo, splitAtPlayhead, deleteSelected, duration]);

  // Clips changed recently, for the highlight glow: clipId -> author
  const recent = useMemo(() => {
    const map = {};
    for (const e of activity) {
      if (now - new Date(e.at).getTime() > HIGHLIGHT_MS) continue;
      for (const c of e.changes) if (c.clipId) map[c.clipId] = e.author;
    }
    return map;
  }, [activity, now]);

  const jumpTo = (change) => {
    if (!change.clipId) return;
    const f = ops.findClip(tlRef.current, change.clipId);
    if (f) { setSelected(change.clipId); setPlayhead(f.clip.start); }
  };

  if (!tl) return <div className="loading">Loading timeline…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">blkgrlco<span>.</span> edit</div>
        <div className="project-name">{tl.project.name}</div>
        <div className="transport">
          <button onClick={() => setPlayhead(0)} title="Go to start (Home)">⏮</button>
          <button className="play" onClick={togglePlay} title="Play / pause (Space)">{playing ? "⏸" : "▶"}</button>
          <span className="timecode">{fmtTime(playhead, true)} <em>/ {fmtTime(duration, true)}</em></span>
        </div>
        <div className="tools">
          <button onClick={splitAtPlayhead} title="Split at playhead (S)">✂ Split</button>
          <button onClick={deleteSelected} disabled={!selected} title="Delete (⌫)">🗑 Delete</button>
          <button onClick={addText} title="Add a text clip at the playhead">T Add text</button>
          <button onClick={undo} title="Undo (⌘Z)">↶</button>
          <button onClick={redo} title="Redo (⇧⌘Z)">↷</button>
        </div>
        <div className="export">
          {exportState?.state === "running" && <span className="progress">Exporting {Math.round((exportState.progress || 0) * 100)}%</span>}
          {exportState?.state === "done" && <a href={exportState.url} target="_blank" rel="noreferrer">⬇ {exportState.file}</a>}
          {exportState?.state === "error" && <span className="err" title={exportState.error}>Export failed</span>}
          <button className="primary" onClick={startExport} disabled={exportState?.state === "running" || duration === 0}>Export MP4</button>
        </div>
        <div className={`conn ${connected ? "on" : "off"}`} title={connected ? "Live: changes to timeline.json show up here instantly" : "Reconnecting…"}>
          {connected ? "● live" : "○ offline"}
        </div>
      </header>

      {fileError && <div className="banner error"><strong>timeline.json:</strong> {fileError}</div>}
      {warnings.length > 0 && <div className="banner warn">{warnings.slice(0, 3).join(" · ")}{warnings.length > 3 ? ` · +${warnings.length - 3} more` : ""}</div>}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}

      <aside className="left"><MediaBin tl={tl} mediaStates={mediaStates} assetBump={assetBump} onScan={() => post("/api/scan")} onAdd={addMedia} /></aside>
      <main className="center"><Preview tl={tl} playhead={playhead} playing={playing} fonts={fonts} /></main>
      <aside className="right">
        <Inspector tl={tl} selected={selected} fonts={fonts} onCommit={commit} />
        <Activity activity={activity} now={now} onJump={jumpTo} />
      </aside>
      <section className="bottom">
        <Timeline tl={tl} playhead={playhead} setPlayhead={(t) => { setPlaying(false); setPlayhead(t); }}
          selected={selected} setSelected={setSelected} zoom={zoom} setZoom={setZoom}
          onCommit={commit} onDropMedia={addMedia} recent={recent} assetBump={assetBump} />
      </section>
    </div>
  );
}
