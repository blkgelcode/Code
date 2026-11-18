import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTimelineSync } from "./lib/sync.js";
import {
  totalDuration, findClip, splitClip, deleteClip, addTextClip, clipEnd, seqOf,
} from "./lib/model.js";
import { fmtTime } from "./lib/format.js";
import MediaBin from "./components/MediaBin.jsx";
import Preview from "./components/Preview.jsx";
import Timeline from "./components/Timeline.jsx";
import Inspector from "./components/Inspector.jsx";
import Activity from "./components/Activity.jsx";
import ImportDialog from "./components/ImportDialog.jsx";
import Versions from "./components/Versions.jsx";
import { describeDrop, importDescribed } from "./lib/importer.js";

export default function App() {
  const sync = useTimelineSync();
  const { timeline, commit, errors } = sync;
  const [selected, setSelected] = useState(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60); // pixels per second
  const [quality, setQuality] = useState(() => {
    try {
      return localStorage.getItem("previewQuality") || "proxy";
    } catch {
      return "proxy";
    }
  });
  const [showImport, setShowImport] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [importing, setImporting] = useState(false);

  const setPreviewQuality = (q) => {
    setQuality(q);
    try {
      localStorage.setItem("previewQuality", q);
    } catch {
      // private window: fine, it just won't be remembered
    }
  };

  // drag files or folders in from Finder: only names and sizes are read
  const onDragOver = (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setDropping(true);
  };
  const onDrop = async (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setDropping(false);
    if (!timeline || errors.length) return;
    setImporting(true);
    try {
      const described = await describeDrop(e.dataTransfer);
      sync.setNotice(`Looking for ${described.length} file${described.length === 1 ? "" : "s"} on disk…`);
      sync.setNotice(await importDescribed(described));
    } catch (err) {
      sync.setNotice(err.message);
    } finally {
      setImporting(false);
    }
  };
  const timeRef = useRef(0);
  const duration = timeline ? totalDuration(timeline) : 0;
  const readOnly = !timeline || errors.length > 0;
  const fps = timeline ? seqOf(timeline).settings.fps : 30;
  const hist = sync.history;

  const seek = useCallback((t) => {
    const v = Math.max(0, t);
    timeRef.current = v;
    setTime(v);
  }, []);

  // playback clock
  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const next = timeRef.current + (now - last) / 1000;
      last = now;
      if (next >= duration) {
        seek(duration);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, seek]);

  // drop the selection if the clip disappeared (deleted by Claude, for example)
  useEffect(() => {
    if (selected && timeline && !findClip(timeline, selected)) setSelected(null);
  }, [timeline, selected]);

  const split = useCallback(() => {
    if (readOnly) return;
    let id = selected;
    if (!id || !findClip(timeline, id)) {
      // nothing selected: split the topmost clip under the playhead
      for (const t of seqOf(timeline).tracks) {
        const c = t.clips.find((c) => c.start < timeRef.current && clipEnd(c) > timeRef.current);
        if (c) {
          id = c.id;
          break;
        }
      }
    }
    if (!id) return;
    if (!commit(splitClip(timeline, id, timeRef.current))) sync.setNotice("Put the playhead inside the clip to split it.");
  }, [readOnly, selected, timeline, commit, sync]);

  /** Delete (Option: leave the linked partner); ⇧Delete ripple-deletes, closing the gap. */
  const remove = useCallback((e) => {
    if (readOnly || !selected) return;
    commit(deleteClip(timeline, selected, { linked: !e?.altKey, ripple: Boolean(e?.shiftKey) }));
    setSelected(null);
  }, [readOnly, selected, timeline, commit]);

  const addTitle = useCallback(() => {
    if (readOnly) return;
    const r = addTextClip(timeline, timeRef.current);
    commit(r.timeline);
    setSelected(r.clipId);
  }, [readOnly, timeline, commit]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const frame = 1 / fps;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) sync.redo();
        else sync.undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        sync.redo();
        return;
      }
      if (mod) return; // leave other browser shortcuts alone
      if (e.code === "Space") {
        e.preventDefault();
        if (!playing && timeRef.current >= duration - 0.01) seek(0);
        setPlaying((p) => !p);
      } else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") remove(e);
      else if (e.key === "t" || e.key === "T") addTitle();
      else if (e.key === "ArrowLeft") seek(timeRef.current - (e.shiftKey ? 1 : frame));
      else if (e.key === "ArrowRight") seek(timeRef.current + (e.shiftKey ? 1 : frame));
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(duration);
      else if (e.key === "Escape") setSelected(null);
      else if (e.key === "=" || e.key === "+") setZoom((z) => Math.min(400, z * 1.25));
      else if (e.key === "-") setZoom((z) => Math.max(5, z / 1.25));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, duration, seek, split, remove, addTitle, fps, sync]);

  const startExport = async () => {
    const r = await fetch("/api/export", { method: "POST" }).then((r) => r.json());
    if (!r.ok) sync.setNotice(r.error);
  };

  const ex = sync.exportStatus;
  const exportLabel = useMemo(() => {
    if (!ex) return "Export MP4";
    if (ex.error) return "Export failed";
    if (ex.done) return "Export MP4";
    return `Exporting ${Math.round((ex.progress || 0) * 100)}%`;
  }, [ex]);

  return (
    <div className="app" onDragOver={onDragOver} onDragLeave={(e) => e.relatedTarget === null && setDropping(false)} onDrop={onDrop}>
      {dropping && <div className="drop-overlay">Drop to import. Files are read where they are; nothing is uploaded.</div>}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} setNotice={sync.setNotice} />}
      {showVersions && <Versions onClose={() => setShowVersions(false)} setNotice={sync.setNotice} />}
      <header className="topbar">
        <div className="brand">Timeline Editor</div>
        <div className={`conn ${sync.connected ? "on" : "off"}`}>{sync.connected ? "Live · saved" : "Reconnecting…"}</div>
        <button onClick={sync.undo} disabled={!hist?.canUndo || readOnly} title={hist?.canUndo ? `Undo (⌘Z): ${hist.canUndo.text}` : "Nothing to undo"}>↶ Undo</button>
        <button onClick={sync.redo} disabled={!hist?.canRedo || readOnly} title={hist?.canRedo ? `Redo (⇧⌘Z): ${hist.canRedo.text}` : "Nothing to redo"}>↷ Redo</button>
        <button onClick={() => setShowVersions(true)} title="Save a named version, or go back to one (autosaves included)">Versions</button>
        <div className="spacer" />
        <button onClick={() => { if (!playing && timeRef.current >= duration - 0.01) seek(0); setPlaying((p) => !p); }} disabled={!duration} title="Play / pause (Space)">
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <span className="timecode">{fmtTime(time, fps)} / {fmtTime(duration, fps)}</span>
        <button onClick={split} disabled={readOnly} title="Split at playhead (S)">Split</button>
        <button onClick={remove} disabled={readOnly || !selected} title="Delete selected (Delete). ⌥ keeps its linked audio/video, ⇧ closes the gap">Delete</button>
        <button onClick={addTitle} disabled={readOnly} title="Add a title at the playhead (T)">+ Title</button>
        <div className="spacer" />
        <button className="primary" onClick={startExport} disabled={readOnly || !duration || (ex && !ex.done && !ex.error)}>{exportLabel}</button>
        <div className="seg" title="Preview from the small proxies (smooth) or from the original files (sharp, may not play for HEVC 10-bit)">
          <button className={quality === "proxy" ? "on" : ""} onClick={() => setPreviewQuality("proxy")}>Proxy</button>
          <button className={quality === "full" ? "on" : ""} onClick={() => setPreviewQuality("full")}>Full quality</button>
        </div>
        {importing && <span className="muted">Importing…</span>}
        {ex?.done && <a className="exportlink" href={`/exports/${ex.file}`} target="_blank" rel="noreferrer">Open {ex.file}</a>}
      </header>

      {errors.length > 0 && (
        <div className="banner error">
          <strong>timeline.json has errors, so editing is paused until it's fixed:</strong>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          {sync.canRecover && (
            <button className="primary" onClick={async () => {
              const r = await fetch("/api/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json());
              if (!r.ok) sync.setNotice(r.error);
            }}>Restore the last good version</button>
          )}
        </div>
      )}
      {ex?.error && <div className="banner error">Export failed: {ex.error}</div>}
      {sync.notice && (
        <div className="banner notice" onClick={sync.dismissNotice}>{sync.notice} <span className="dismiss">×</span></div>
      )}

      <main className="workspace">
        <MediaBin timeline={timeline} mediaStatus={sync.media} readOnly={readOnly} commit={commit} setNotice={sync.setNotice} openImport={() => setShowImport(true)} />
        <Preview timeline={timeline} time={time} playing={playing} mediaStatus={sync.media} quality={quality} />
        <aside className="side">
          <Inspector timeline={timeline} selected={selected} readOnly={readOnly} commit={commit} />
          <Activity activity={sync.activity} history={hist} onUndo={sync.undoEntry} readOnly={readOnly} onPick={(id) => {
            const f = timeline && findClip(timeline, id);
            if (f) {
              setSelected(id);
              seek(f.clip.start);
            }
          }} />
        </aside>
      </main>

      {timeline && (
        <Timeline
          timeline={timeline}
          time={time}
          seek={seek}
          zoom={zoom}
          setZoom={setZoom}
          selected={selected}
          setSelected={setSelected}
          readOnly={readOnly}
          commit={commit}
          lastChange={sync.lastChange}
          mediaStatus={sync.media}
          setNotice={sync.setNotice}
        />
      )}
    </div>
  );
}
