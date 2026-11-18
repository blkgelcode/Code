import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, connect, fmtTime, native } from "./api";
import * as E from "./edit";
import { diff } from "../shared/ops";
import { sequenceDuration, mediaName, type Timeline, type Media } from "../shared/model";
import Timeline_ from "./components/Timeline";
import Viewer, { type Quality } from "./components/Viewer";
import MediaBin from "./components/MediaBin";
import Inspector from "./components/Inspector";
import Mixer from "./components/Mixer";
import Exports from "./components/Exports";
import History, { type HistoryEntry } from "./components/History";
import type { MediaStatus, QueueInfo } from "./media";
import { FrameEngine } from "./engine/frames";
import { Transport } from "./engine/transport";
import { AudioEngine } from "./engine/audio";

const HIGHLIGHT_MS = 6000;
type UndoState = { you: { undo: boolean; redo: boolean }; claude: { undo: boolean; redo: boolean } };
type Presence = { author: string; message: string; until: number } | null;
type Monitor = "program" | "source";
type Marks = Record<string, { in?: number; out?: number }>;

/** Re-render on transport changes, at most ~15×/s (enough for a timecode or a play button). */
function useTransportView(t: Transport) {
  const snap = useRef({ time: t.time, rate: t.rate });
  const subscribe = useCallback((cb: () => void) => {
    let last = 0, timer = 0;
    const fire = () => { last = performance.now(); snap.current = { time: t.time, rate: t.rate }; cb(); };
    const unsub = t.subscribe(() => {
      // always show where we stopped; while playing, throttle
      if (!t.playing || snap.current.rate !== t.rate || performance.now() - last > 66) { clearTimeout(timer); timer = 0; fire(); }
      else if (!timer) timer = window.setTimeout(() => { timer = 0; fire(); }, 66);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [t]);
  return useSyncExternalStore(subscribe, () => snap.current);
}

const loadMarks = (): Marks => { try { return JSON.parse(localStorage.getItem("blkedit.marks") || "{}"); } catch { return {}; } };

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
  const [mediaStatus, setMediaStatus] = useState<Record<string, MediaStatus>>({});
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [quality, setQuality] = useState<Quality>(() => (localStorage.getItem("blkedit.quality") === "full" ? "full" : "proxy"));
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(60);
  const [exportsInfo, setExportsInfo] = useState<any>({ jobs: [], files: [] });
  const [showExports, setShowExports] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dropping, setDropping] = useState(false);
  const [monitor, setMonitor] = useState<Monitor>("program");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(() => localStorage.getItem("blkedit.showSource") !== "0");
  const [rightTab, setRightTab] = useState<"clip" | "mixer">("clip");
  const [marks, setMarks] = useState<Marks>(loadMarks);
  const tlRef = useRef<Timeline | null>(null);
  const mediaStatusRef = useRef<Record<string, MediaStatus>>({});
  const queue = useRef(Promise.resolve());
  const toastTimer = useRef<number>();
  tlRef.current = tl;
  mediaStatusRef.current = mediaStatus;

  // The playback machinery lives outside React state.
  const engine = useMemo(() => new FrameEngine(), []);
  const programT = useMemo(() => new Transport("program"), []);
  const sourceT = useMemo(() => new Transport("source"), []);
  const audio = useMemo(() => new AudioEngine(programT), [programT]);
  const pv = useTransportView(programT);
  const sv = useTransportView(sourceT);
  useEffect(() => { (window as any).__blkedit = { engine, programT, sourceT, audio }; }, [engine, programT, sourceT, audio]);

  const seq = tl ? E.activeSeq(tl) : null;
  const duration = useMemo(() => (seq ? sequenceDuration(seq) : 0), [seq]);
  const sourceMedia = tl && sourceId ? tl.media.find((m) => m.id === sourceId) || null : null;
  const activeT = monitor === "source" && sourceMedia ? sourceT : programT;
  // keys must act on the monitor you just clicked, even before React re-renders
  const monitorRef = useRef<Monitor>(monitor);
  const sourceMediaRef = useRef(sourceMedia);
  sourceMediaRef.current = sourceMedia;
  const activate = useCallback((m: Monitor) => { monitorRef.current = m; setMonitor(m); }, []);

  useEffect(() => { if (seq) programT.setDuration(duration, seq.fps); }, [duration, seq?.fps]); // eslint-disable-line
  useEffect(() => { sourceT.setDuration(sourceMedia?.duration ?? (sourceMedia ? 5 : 0), sourceMedia?.fps || 30); }, [sourceMedia?.id, sourceMedia?.duration]); // eslint-disable-line
  useEffect(() => { if (tl) audio.update(tl, mediaStatus); }, [tl, mediaStatus, audio]);
  useEffect(() => { try { localStorage.setItem("blkedit.quality", quality); localStorage.setItem("blkedit.showSource", showSource ? "1" : "0"); localStorage.setItem("blkedit.marks", JSON.stringify(marks)); } catch { /* */ } }, [quality, showSource, marks]);
  // Sound can only start after a click or key press.
  useEffect(() => {
    const go = () => audio.resume();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  }, [audio]);

  const flash = useCallback((text: string, kind = "info") => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadState = useCallback(async () => {
    const s = await api.state();
    setTl(s.timeline); setRev(s.rev); setWarnings(s.warnings || []); setFileError(s.fileError);
    setBootNotes(s.bootNotes || []); setHistory(s.history || []); setUndoState(s.undo);
    setFonts(s.fonts || []); setMediaStatus(s.mediaStatus || {}); setQueueInfo(s.queue || null); setPresence(s.presence);
    if (s.exports) setExportsInfo(s.exports);
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
      else if (msg.type === "media-status") { setMediaStatus((m) => ({ ...m, ...msg.statuses })); setQueueInfo(msg.queue); }
      else if (msg.type === "import") setImporting(msg.finished ? null : { done: msg.done, total: msg.total, failed: msg.failed });
      else if (msg.type === "exports") setExportsInfo(msg.exports);
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

  // ------------------------------------------------------------------ actions
  const splitAtPlayhead = useCallback(() => {
    const playhead = programT.frameTime();
    let cur = tlRef.current!;
    const sel = selected ? E.findClip(cur, selected) : null;
    const targets = sel && playhead > sel.clip.start && playhead < E.clipEnd(sel.clip) ? [sel.clip.id] : E.clipsAt(cur, playhead).map((h) => h.clip.id);
    if (!targets.length) return flash("Put the playhead over a clip to split it.");
    let lastNew: string | null = null;
    for (const id of targets) { const r = E.splitClip(cur, id, playhead); if (r.newId) { cur = r.timeline; lastNew = r.newId; } }
    if (lastNew) { commit(cur, { select: sel ? lastNew : null }); if (sel) setSelected(lastNew); }
  }, [selected, commit, flash, programT]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    commit(E.deleteClip(tlRef.current!, selected));
    setSelected(null);
  }, [selected, commit]);

  const addText = useCallback(() => {
    const { timeline, clipId } = E.addTextClip(tlRef.current!, programT.frameTime());
    commit(timeline, { select: clipId });
    setSelected(clipId);
  }, [commit, programT]);

  /** Put media on the timeline (optionally just its marked In→Out range). */
  const addMedia = useCallback((mediaId: string, trackId?: string, start?: number, range?: { in?: number; out?: number }) => {
    const cur = tlRef.current!;
    const m = E.mediaById(cur, mediaId);
    if (!m) return;
    const st = mediaStatusRef.current[mediaId];
    if (st && !st.online) return flash(`${m.name} is offline. Reconnect the drive or Relink it first.`, "warn");
    if (m.type === "video" && st && st.proxy.state !== "ready") return flash(`${m.name}'s preview isn't ready yet (${st.proxy.state === "running" ? Math.round((st.proxy.progress || 0) * 100) + "%" : st.proxy.state}).`);
    const tracks = E.activeSeq(cur).tracks;
    let track = trackId ? tracks.find((t) => t.id === trackId) : undefined;
    if (!track || !E.acceptsMedia(track.kind, m.type)) track = tracks.find((t) => !t.locked && E.acceptsMedia(t.kind, m.type) && (m.type !== "video" || t.kind === "video"));
    if (!track) return flash(`No unlocked ${m.type === "audio" ? "audio" : "video"} track to put that on.`);
    const at = start ?? track.clips.reduce((e, c) => Math.max(e, E.clipEnd(c)), 0);
    const r = range ?? marks[mediaId];
    const { timeline, clipId } = E.addMediaClip(cur, mediaId, track.id, at, r);
    if (clipId) { commit(timeline, { select: clipId }); setSelected(clipId); }
  }, [commit, flash, marks]);

  const importPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    const r = await api.importPaths(paths);
    if (r.status !== 200) return flash(r.body.error || "Import failed.", "error");
    const { added, relinked, skipped, failed } = r.body;
    flash([`Added ${added.length}`, relinked?.length && `reconnected ${relinked.length}`, skipped && `${skipped} already in the project`, failed.length && `${failed.length} couldn't be read: ${failed.slice(0, 2).map((f: any) => `${f.path.split("/").pop()} (${f.error})`).join("; ")}`].filter(Boolean).join(" · "), failed.length ? "warn" : "info");
  }, [flash]);

  const retryMedia = useCallback(async (m: Media) => { await fetch(`/api/media/${m.id}/retry`, { method: "POST" }); }, []);
  const relinkMedia = useCallback(async (m: Media) => {
    const picked = native ? (await native.pickMedia())[0] : window.prompt(`New location of ${m.name} (full path):`)?.trim();
    if (!picked) return;
    const post = (force: boolean) => fetch(`/api/media/${m.id}/relink`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: picked, force, author: "you" }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    let r = await post(false);
    if (r.status === 409 && r.body.needsForce && confirm(r.body.error)) r = await post(true);
    if (r.status !== 200) flash(r.body.error || "Couldn't relink.", "warn");
    else flash(`Relinked ${m.name}.`);
  }, [flash]);

  const importDialog = useCallback(async (folder = false) => {
    if (native) return importPaths(await (folder ? native.pickFolder() : native.pickMedia()));
    const p = window.prompt("Path of a file or folder to import (in the Mac app you get a normal file picker):");
    if (p) importPaths([p.trim()]);
  }, [importPaths]);

  const startExport = useCallback(async () => {
    const r = await api.exportMp4();
    if (r.status !== 200) flash(r.body.error || "Couldn't start the export.", "warn");
    else { setShowExports(true); flash(`Added to the export queue: ${r.body.name}`); }
  }, [flash]);

  const openInSource = useCallback((id: string) => {
    setSourceId(id);
    setShowSource(true);
    activate("source");
    sourceT.pause();
    sourceT.seek(marks[id]?.in ?? 0);
  }, [sourceT, marks, activate]);

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
    else if (action === "export") startExport();
  }), [importDialog, undo, redo, startExport]);

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const T = monitorRef.current === "source" && sourceMediaRef.current ? sourceT : programT;
      const k = e.key.toLowerCase();
      if (e.code === "Space") { e.preventDefault(); T.toggle(); }
      else if (mod && k === "z") { if (native) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && k === "i") { if (native) return; e.preventDefault(); importDialog(e.shiftKey); }
      else if (mod && k === "e") { if (native) return; e.preventDefault(); startExport(); }
      else if (mod) return;
      else if (k === "l") { e.preventDefault(); T.shuttle(1); }
      else if (k === "j") { e.preventDefault(); T.shuttle(-1); }
      else if (k === "k") { e.preventDefault(); if (!e.repeat) { T.kHeld = true; T.pause(); } }
      else if (k === "i" && T === sourceT && sourceMedia) setMarks((m) => ({ ...m, [sourceMedia.id]: { ...m[sourceMedia.id], in: T.frameTime() } }));
      else if (k === "o" && T === sourceT && sourceMedia) setMarks((m) => ({ ...m, [sourceMedia.id]: { ...m[sourceMedia.id], out: T.frameTime() } }));
      else if (k === "s") splitAtPlayhead();
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); T.step(e.shiftKey ? -T.fps : -1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); T.step(e.shiftKey ? T.fps : 1); }
      else if (e.key === "Home") { T.pause(); T.seek(0); }
      else if (e.key === "End") { T.pause(); T.seek(T.duration); }
      else if (e.key === "=" || e.key === "+") setZoom((z) => Math.min(400, z * 1.25));
      else if (e.key === "-") setZoom((z) => Math.max(5, z / 1.25));
      else if (e.key === "Escape") setSelected(null);
    };
    const onUp = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "k") { programT.kHeld = false; sourceT.kHeld = false; } };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp); };
  }, [undo, redo, splitAtPlayhead, deleteSelected, importDialog, startExport, sourceT, programT, sourceMedia]);

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
    programT.pause();
    programT.seek(f.clip.start);
    activate("program");
  };

  if (!tl || !seq) return <div className="loading">Loading timeline…</div>;
  const livePresence = presence && presence.until > now ? presence : null;
  const view = monitor === "source" && sourceMedia ? sv : pv;
  const runningExport = exportsInfo.jobs?.find((j: any) => j.state === "running");
  const srcMarks = sourceMedia ? marks[sourceMedia.id] || {} : {};
  const rateLabel = (r: number) => (r === 0 ? "" : r === 1 ? "" : `${r < 0 ? "◀ " : ""}${Math.abs(r) < 1 ? "¼" : Math.abs(r)}×`);

  return (
    <div className={`editor ${dropping ? "dropping" : ""}`}>
      <header className="topbar">
        <div className="brand">blkgrlco<span>.</span> edit</div>
        <div className="project-name" title={tl.project.name}>{tl.project.name}</div>
        <div className="transport">
          <button onClick={() => { activeT.pause(); activeT.seek(0); }} title="Go to start (Home)">⏮</button>
          <button onClick={() => activeT.shuttle(-1)} title="Play backwards; again for faster (J)">◀◀</button>
          <button className="play" onClick={() => activeT.toggle()} title="Play / pause (Space) · stop (K)">{view.rate !== 0 ? "⏸" : "▶"}</button>
          <button onClick={() => activeT.shuttle(1)} title="Play; again for 2×, 4×, 8× (L)">▶▶</button>
          <span className="timecode" data-testid="timecode">{fmtTime(view.time, true)} <em>/ {fmtTime(activeT.duration, true)}</em>{rateLabel(view.rate) && <b className="rate">{rateLabel(view.rate)}</b>}</span>
          <span className="which">{monitor === "source" && sourceMedia ? "Source" : "Program"}</span>
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
          {runningExport && <button className="link" onClick={() => setShowExports(true)}>Exporting {Math.round((runningExport.progress || 0) * 100)}%</button>}
          <button onClick={() => setShowExports((v) => !v)} title="Export queue and finished files">Exports{exportsInfo.jobs?.filter((j: any) => j.state === "queued").length ? ` (${exportsInfo.jobs.filter((j: any) => j.state === "queued").length} waiting)` : ""}</button>
          <button className="primary" onClick={startExport} disabled={duration === 0}>Export MP4</button>
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
      {showExports && <Exports info={exportsInfo} onClose={() => setShowExports(false)} flash={flash} />}

      <aside className="left">
        <MediaBin tl={tl} status={mediaStatus} queue={queueInfo} importing={importing} selectedId={sourceId}
          onImport={importDialog} onAdd={(id) => addMedia(id)} onOpen={openInSource} onRetry={retryMedia} onRelink={relinkMedia} />
      </aside>
      <main className="center">
        <div className="monitors">
          {showSource && (
            <div className="monitor-col">
              <Viewer kind="source" media={sourceMedia} marks={srcMarks} engine={engine} transport={sourceT} status={mediaStatus} quality={quality}
                active={monitor === "source"} onActivate={() => activate("source")} />
              <SourceBar t={sourceT} view={sv} media={sourceMedia} marks={srcMarks}
                onMark={(which) => sourceMedia && setMarks((m) => ({ ...m, [sourceMedia.id]: { ...m[sourceMedia.id], [which]: sourceT.frameTime() } }))}
                onClear={() => sourceMedia && setMarks((m) => { const n = { ...m }; delete n[sourceMedia.id]; return n; })}
                onAdd={() => sourceMedia && addMedia(sourceMedia.id)} />
            </div>
          )}
          <div className="monitor-col">
            <Viewer kind="program" tl={tl} fonts={fonts} engine={engine} transport={programT} status={mediaStatus} quality={quality}
              active={monitor === "program"} onActivate={() => activate("program")} />
            <div className="monitor-bar">
              <div className="quality" role="group" aria-label="Preview quality">
                <button className={quality === "proxy" ? "on" : ""} onClick={() => setQuality("proxy")} title="Light 960×540 previews: smooth on any footage">Proxy</button>
                <button className={quality === "full" ? "on" : ""} onClick={() => setQuality("full")} title="Decodes the original files; if this Mac can't, paused frames are exact full-resolution stills">Full</button>
              </div>
              <button className="ghost" onClick={() => setShowSource((v) => !v)}>{showSource ? "Hide source" : "Show source"}</button>
              <span className="meta">{seq.name} · {seq.width}×{seq.height} · {seq.fps} fps · export always uses the originals</span>
            </div>
          </div>
        </div>
      </main>
      <aside className="right">
        <div className="tabs">
          <button className={rightTab === "clip" ? "on" : ""} onClick={() => setRightTab("clip")}>Clip</button>
          <button className={rightTab === "mixer" ? "on" : ""} onClick={() => setRightTab("mixer")}>Mixer</button>
        </div>
        {rightTab === "clip" ? <Inspector tl={tl} selected={selected} fonts={fonts} onCommit={commit} /> : <Mixer tl={tl} audio={audio} onCommit={commit} />}
        <History history={history} now={now} undoState={undoState} onJump={jumpTo}
          onRevert={(r) => runHistory(() => api.revert(r))} onRestore={(r) => { if (confirm(`Make the timeline look exactly like it did at rev ${r}? (You can undo this.)`)) runHistory(() => api.restore(r)); }} />
      </aside>
      <section className="bottom" onPointerDown={() => activate("program")}>
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
        <Timeline_ tl={tl} transport={programT}
          selected={selected} setSelected={setSelected} zoom={zoom} setZoom={setZoom}
          onCommit={commit} onDropMedia={(id, track, start) => addMedia(id, track, start)} recent={recent} status={mediaStatus} />
      </section>
    </div>
  );
}

/** Under the source monitor: In/Out marks and "add to the timeline". */
function SourceBar({ t, view, media, marks, onMark, onClear, onAdd }: {
  t: Transport; view: { time: number }; media: Media | null; marks: { in?: number; out?: number };
  onMark: (w: "in" | "out") => void; onClear: () => void; onAdd: () => void;
}) {
  const dur = t.duration || 1;
  const a = marks.in ?? 0, b = marks.out ?? dur;
  return (
    <div className="monitor-bar source-bar">
      <div className="mini-ruler" onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const seek = (x: number) => { t.pause(); t.seek(((x - r.left) / r.width) * dur); };
        seek(e.clientX);
        const mv = (ev: PointerEvent) => seek(ev.clientX);
        const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
      }}>
        <div className="range" style={{ left: `${(a / dur) * 100}%`, width: `${((b - a) / dur) * 100}%` }} />
        <div className="head" style={{ left: `${(view.time / dur) * 100}%` }} />
      </div>
      <button onClick={() => onMark("in")} disabled={!media} title="Mark In (I)">In</button>
      <button onClick={() => onMark("out")} disabled={!media} title="Mark Out (O)">Out</button>
      <button className="ghost" onClick={onClear} disabled={!media || (marks.in === undefined && marks.out === undefined)}>Clear</button>
      <span className="meta">{media ? `${fmtTime(a, true)} → ${fmtTime(b, true)} (${(b - a).toFixed(2)}s)` : ""}</span>
      <button className="primary small" onClick={onAdd} disabled={!media} title={media ? `Add ${mediaName(media)} (In→Out) to the end of the timeline` : ""}>Add to timeline</button>
    </div>
  );
}
