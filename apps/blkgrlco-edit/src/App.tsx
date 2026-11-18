import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, connect, fmtTime, native } from "./api";
import * as E from "./edit";
import { diff } from "../shared/ops";
import { sequenceDuration, type Timeline } from "../shared/model";
import Timeline_ from "./components/Timeline";
import Preview from "./components/Preview";
import MediaBin from "./components/MediaBin";
import Inspector from "./components/Inspector";
import History, { type HistoryEntry } from "./components/History";

const HIGHLIGHT_MS = 6000;
type UndoState = { you: { undo: boolean; redo: boolean }; claude: { undo: boolean; redo: boolean } };
type Presence = { author: string; message: string; until: number } | null;

export default function App() {
  const [tl, setTl] = useState<Timeline | null>(null);
  const [rev, setRev] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [bootNotes, setBootNotes] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [presence, setPresence] = useState<Presence>(null);
  const [fonts, setFonts] = useState<{ key: string; source: string }[]>([]);
  const [mediaStates, setMediaStates] = useState<Record<string, string>>({});
  const [assetBump, setAssetBump] = useState(0);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [exportState, setExportState] = useState<any>(null);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dropping, setDropping] = useState(false);
  const tlRef = useRef<Timeline | null>(null);
  const queue = useRef(Promise.resolve());
  const toastTimer = useRef<number>();
  tlRef.current = tl;

  const seq = tl ? E.activeSeq(tl) : null;
  const duration = useMemo(() => (seq ? sequenceDuration(seq) : 0), [seq]);

  const flash = useCallback((text: string, kind = "info") => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadState = useCallback(async () => {
    const s = await api.state();
    setTl(s.timeline); setRev(s.rev); setWarnings(s.warnings || []); setFileError(s.fileError);
    setBootNotes(s.bootNotes || []); setHistory(s.history || []); setUndoState(s.undo);
    setFonts(s.fonts || []); setMediaStates(s.mediaStates || {}); setPresence(s.presence);
  }, []);

  // ------------------------------------------------------------------ live updates
  useEffect(() => {
    loadState();
    return connect((msg) => {
      if (msg.type === "change") {
        setTl(msg.timeline); setRev(msg.rev); setWarnings(msg.warnings || []); setFileError(null); setUndoState(msg.undo);
        setHistory((h) => [...h.filter((e) => e.rev !== msg.entry.rev), msg.entry].slice(-300).map((e) =>
          msg.entry.ref !== undefined && e.rev === msg.entry.ref ? { ...e, undone: msg.entry.kind === "undo" || msg.entry.kind === "revert" } : e));
      } else if (msg.type === "file-error") setFileError(msg.message);
      else if (msg.type === "presence") setPresence(msg.presence);
      else if (msg.type === "media-status") setMediaStates((m) => ({ ...m, [msg.id]: msg.state }));
      else if (msg.type === "media-asset") setAssetBump((n) => n + 1);
      else if (msg.type === "export") setExportState(msg);
      else if (msg.type === "hello") loadState(); // (re)connected: catch up on anything missed
    }, setConnected);
  }, [loadState]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (selected && tl && E.findClip(tl, selected)?.seq.id !== tl.activeSequence) setSelected(null);
  }, [tl, selected]);
  useEffect(() => { if (tl) document.title = `BLKGRLCO Edit — ${tl.project.name}`; }, [tl?.project.name]); // eslint-disable-line

  // ------------------------------------------------------------------ committing edits
  /** Show `next` right away, send the difference as ops; the server's broadcast confirms it. */
  const commit = useCallback((next: Timeline, opts: { select?: string | null } = {}) => {
    const base = tlRef.current;
    if (!base || next === base) return;
    const ops = diff(base, next);
    if (!ops.length) return;
    setTl(next);
    queue.current = queue.current.then(async () => {
      const r = await api.ops(ops);
      if (r.status === 409) { setTl(r.body.timeline); setRev(r.body.rev); flash(r.body.error, "warn"); }
      else if (r.status !== 200) { flash(r.body.error || "Couldn't save that change.", "error"); loadState(); }
      else if (opts.select && r.body.idMap?.[opts.select]) setSelected(r.body.idMap[opts.select]);
    }).catch(() => flash("Lost connection to the app's server. It restarts on its own; your edits are safe on disk.", "error"));
  }, [flash, loadState]);

  const runHistory = useCallback((fn: () => Promise<{ status: number; body: any }>) => {
    queue.current = queue.current.then(async () => {
      const r = await fn();
      if (r.status !== 200) flash(r.body.error || "Couldn't do that.", r.status === 409 ? "warn" : "error");
    });
  }, [flash]);
  const undo = useCallback(() => runHistory(api.undo), [runHistory]);
  const redo = useCallback(() => runHistory(api.redo), [runHistory]);

  // ------------------------------------------------------------------ playback clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPlayhead((p) => { const n = p + dt; if (n >= duration) { setPlaying(false); return duration; } return n; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);
  const togglePlay = useCallback(() => setPlaying((p) => { if (!p && playhead >= duration - 0.01) setPlayhead(0); return !p; }), [playhead, duration]);

  // ------------------------------------------------------------------ actions
  const splitAtPlayhead = useCallback(() => {
    let cur = tlRef.current!;
    const sel = selected ? E.findClip(cur, selected) : null;
    const targets = sel && playhead > sel.clip.start && playhead < E.clipEnd(sel.clip) ? [sel.clip.id] : E.clipsAt(cur, playhead).map((h) => h.clip.id);
    if (!targets.length) return flash("Put the playhead over a clip to split it.");
    let lastNew: string | null = null;
    for (const id of targets) { const r = E.splitClip(cur, id, playhead); if (r.newId) { cur = r.timeline; lastNew = r.newId; } }
    if (lastNew) { commit(cur, { select: sel ? lastNew : null }); if (sel) setSelected(lastNew); }
  }, [selected, playhead, commit, flash]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    commit(E.deleteClip(tlRef.current!, selected));
    setSelected(null);
  }, [selected, commit]);

  const addText = useCallback(() => {
    const { timeline, clipId } = E.addTextClip(tlRef.current!, playhead);
    commit(timeline, { select: clipId });
    setSelected(clipId);
  }, [playhead, commit]);

  const addMedia = useCallback((mediaId: string, trackId?: string, start?: number) => {
    const cur = tlRef.current!;
    const m = E.mediaById(cur, mediaId);
    if (!m) return;
    const tracks = E.activeSeq(cur).tracks;
    let track = trackId ? tracks.find((t) => t.id === trackId) : undefined;
    if (!track || !E.acceptsMedia(track.kind, m.type)) track = tracks.find((t) => !t.locked && E.acceptsMedia(t.kind, m.type) && (m.type !== "video" || t.kind === "video"));
    if (!track) return flash(`No unlocked ${m.type === "audio" ? "audio" : "video"} track to put that on.`);
    const at = start ?? track.clips.reduce((e, c) => Math.max(e, E.clipEnd(c)), 0);
    const { timeline, clipId } = E.addMediaClip(cur, mediaId, track.id, at);
    if (clipId) { commit(timeline, { select: clipId }); setSelected(clipId); }
  }, [commit, flash]);

  const importPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    flash(`Importing ${paths.length} item${paths.length > 1 ? "s" : ""}…`);
    const r = await api.importPaths(paths);
    if (r.status !== 200) return flash(r.body.error || "Import failed.", "error");
    const { added, skipped, failed } = r.body;
    flash([`Added ${added.length}`, skipped && `${skipped} already in the project`, failed.length && `${failed.length} couldn't be read (${failed[0].error})`].filter(Boolean).join(" · "), failed.length ? "warn" : "info");
  }, [flash]);

  const importDialog = useCallback(async (folder = false) => {
    if (native) return importPaths(await (folder ? native.pickFolder() : native.pickMedia()));
    const p = window.prompt("Path of a file or folder to import (in the Mac app you get a normal file picker):");
    if (p) importPaths([p.trim()]);
  }, [importPaths]);

  // Drag files/folders from Finder. Only the Mac app can see their paths.
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDropping(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDropping(false); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      setDropping(false);
      if (!native) return flash("Dragging from Finder needs the Mac app. In the browser, use Import… or put files in the project's media/ folder.", "warn");
      importPaths(native.pathsForFiles([...e.dataTransfer.files]));
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [importPaths, flash]);

  useEffect(() => native?.onMenu((action) => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "");
    if (action === "import") importDialog(false);
    else if (action === "import-folder") importDialog(true);
    else if (action === "undo") { if (typing) document.execCommand("undo"); else undo(); }
    else if (action === "redo") { if (typing) document.execCommand("redo"); else redo(); }
    else if (action === "export") api.exportMp4();
  }), [importDialog, undo, redo]);

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const fps = seq?.fps || 30;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (mod && e.key.toLowerCase() === "z") { if (native) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === "i") { if (native) return; e.preventDefault(); importDialog(e.shiftKey); }
      else if (mod) return;
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
  }, [togglePlay, undo, redo, splitAtPlayhead, deleteSelected, importDialog, duration, seq]);

  // Clips changed in the last few seconds glow, colored by who changed them.
  const recent = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of history) {
      if (now - new Date(e.at).getTime() > HIGHLIGHT_MS) continue;
      for (const c of e.changes) if (c.clipId) map[c.clipId] = e.author;
    }
    return map;
  }, [history, now]);

  const jumpTo = (clipId?: string) => {
    if (!clipId || !tlRef.current) return;
    const f = E.findClip(tlRef.current, clipId);
    if (!f) return;
    if (f.seq.id !== tlRef.current.activeSequence) commit(E.setActiveSequence(tlRef.current, f.seq.id));
    setSelected(clipId);
    setPlayhead(f.clip.start);
  };

  if (!tl || !seq) return <div className="loading">Loading timeline…</div>;
  const livePresence = presence && presence.until > now ? presence : null;

  return (
    <div className={`app ${dropping ? "dropping" : ""}`}>
      <header className="topbar">
        <div className="brand">blkgrlco<span>.</span> edit</div>
        <div className="project-name" title={tl.project.name}>{tl.project.name}</div>
        <div className="transport">
          <button onClick={() => setPlayhead(0)} title="Go to start (Home)">⏮</button>
          <button className="play" onClick={togglePlay} title="Play / pause (Space)">{playing ? "⏸" : "▶"}</button>
          <span className="timecode">{fmtTime(playhead, true)} <em>/ {fmtTime(duration, true)}</em></span>
        </div>
        <div className="tools">
          <button onClick={() => importDialog(false)} title="Import files by path (⌘I; ⇧⌘I for a folder)">⤓ Import</button>
          <button onClick={splitAtPlayhead} title="Split at playhead (S)">✂ Split</button>
          <button onClick={deleteSelected} disabled={!selected} title="Delete (⌫)">🗑</button>
          <button onClick={addText} title="Add a text clip at the playhead">T</button>
          <button onClick={undo} disabled={!undoState?.you.undo} title="Undo your last change (⌘Z)">↶</button>
          <button onClick={redo} disabled={!undoState?.you.redo} title="Redo (⇧⌘Z)">↷</button>
        </div>
        {livePresence && <div className={`presence ${livePresence.author}`}>{livePresence.author === "claude" ? "Claude" : livePresence.author} is {livePresence.message}…</div>}
        <div className="export">
          {exportState?.state === "running" && <span className="progress">Exporting {Math.round((exportState.progress || 0) * 100)}%</span>}
          {exportState?.state === "done" && <a href={exportState.url} target="_blank" rel="noreferrer">⬇ {exportState.file}</a>}
          {exportState?.state === "error" && <span className="err" title={exportState.error}>Export failed</span>}
          <button className="primary" onClick={() => api.exportMp4()} disabled={exportState?.state === "running" || duration === 0}>Export MP4</button>
        </div>
        <div className={`conn ${connected ? "on" : "off"}`} title={connected ? `Live · rev ${rev}` : "Reconnecting…"}>{connected ? `● live · rev ${rev}` : "○ reconnecting"}</div>
      </header>

      <div className="banners">
        {fileError && <div className="banner error"><strong>timeline.json:</strong> {fileError}</div>}
        {bootNotes.map((n, i) => <div key={i} className="banner note">{n} <button onClick={() => setBootNotes((b) => b.filter((_, j) => j !== i))}>OK</button></div>)}
        {warnings.length > 0 && <div className="banner warn">{warnings.slice(0, 3).join(" · ")}{warnings.length > 3 ? ` · +${warnings.length - 3} more` : ""}</div>}
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {dropping && <div className="drop-overlay">Drop to import by path (nothing is copied)</div>}

      <aside className="left"><MediaBin tl={tl} mediaStates={mediaStates} assetBump={assetBump} onImport={importDialog} onAdd={addMedia} /></aside>
      <main className="center"><Preview tl={tl} playhead={playhead} playing={playing} fonts={fonts} /></main>
      <aside className="right">
        <Inspector tl={tl} selected={selected} fonts={fonts} onCommit={commit} />
        <History history={history} now={now} undoState={undoState} onJump={jumpTo}
          onRevert={(r) => runHistory(() => api.revert(r))} onRestore={(r) => { if (confirm(`Make the timeline look exactly like it did at rev ${r}? (You can undo this.)`)) runHistory(() => api.restore(r)); }} />
      </aside>
      <section className="bottom">
        <div className="seq-tabs">
          {tl.sequences.map((s) => (
            <button key={s.id} className={s.id === tl.activeSequence ? "active" : ""} onClick={() => s.id !== tl.activeSequence && commit(E.setActiveSequence(tl, s.id))}>
              {s.name} <em>{s.width}×{s.height}</em>
            </button>
          ))}
          <button className="ghost" title="Duplicate this sequence (e.g. to make the Shorts cut)" onClick={() => {
            const name = prompt("Name for the copy:", `${seq.name} copy`);
            if (name) commit(E.duplicateSequence(tl, name));
          }}>+ Duplicate</button>
        </div>
        <Timeline_ tl={tl} playhead={playhead} setPlayhead={(t: number) => { setPlaying(false); setPlayhead(t); }}
          selected={selected} setSelected={setSelected} zoom={zoom} setZoom={setZoom}
          onCommit={commit} onDropMedia={addMedia} recent={recent} assetBump={assetBump} />
      </section>
    </div>
  );
}
