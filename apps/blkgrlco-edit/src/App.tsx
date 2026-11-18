import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, connect, fmtTime, native } from "./api";
import * as E from "./edit";
import { diff } from "../shared/ops";
import { flattenedTimeline } from "../shared/flatten";
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
import * as X from "../shared/editing";
import { toTimecode, parseTimecode } from "../shared/timecode";
import { COMMANDS, effective, eventKey, keyIndex, keyLabel, loadKeys, saveKeys, type KeySettings } from "./keymap";
import { CommandPalette, ShortcutEditor } from "./components/Commands";
import Markers from "./components/Markers";
import { TOOLS, type Tool } from "./components/Timeline";

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
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection[0] ?? null;
  const setSelected = useCallback((id: string | null) => setSelection(id ? [id] : []), []);
  const [tool, setTool] = useState<Tool>("select");
  const [snapping, setSnapping] = useState(() => localStorage.getItem("blkedit.snap") !== "0");
  const [linkedSel, setLinkedSel] = useState(() => localStorage.getItem("blkedit.linked") !== "0");
  const [keys, setKeys] = useState<KeySettings>(loadKeys);
  const [palette, setPalette] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [lastTrack, setLastTrack] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [tcEntry, setTcEntry] = useState<string | null>(null); // "go to timecode" box
  const [revealId, setRevealId] = useState<string | null>(null);
  const clipboard = useRef<X.ClipboardData | null>(null);
  const [zoom, setZoom] = useState(60);
  const [exportsInfo, setExportsInfo] = useState<any>({ jobs: [], files: [] });
  const [showExports, setShowExports] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dropping, setDropping] = useState(false);
  const [monitor, setMonitor] = useState<Monitor>("program");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(() => localStorage.getItem("blkedit.showSource") !== "0");
  const [rightTab, setRightTab] = useState<"clip" | "mixer" | "markers">("clip");
  const [marks, setMarks] = useState<Marks>(loadMarks);
  const marksRef = useRef<Marks>({});
  const tlRef = useRef<Timeline | null>(null);
  const mediaStatusRef = useRef<Record<string, MediaStatus>>({});
  const queue = useRef(Promise.resolve());
  const toastTimer = useRef<number>();
  tlRef.current = tl;
  marksRef.current = marks;
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
  const playTl = useMemo(() => (tl ? flattenedTimeline(tl) : null), [tl]);
  useEffect(() => { if (playTl) audio.update(playTl, mediaStatus); }, [playTl, mediaStatus, audio]);
  useEffect(() => { try { localStorage.setItem("blkedit.quality", quality); localStorage.setItem("blkedit.showSource", showSource ? "1" : "0"); localStorage.setItem("blkedit.marks", JSON.stringify(marks)); localStorage.setItem("blkedit.snap", snapping ? "1" : "0"); localStorage.setItem("blkedit.linked", linkedSel ? "1" : "0"); } catch { /* */ } }, [quality, showSource, marks, snapping, linkedSel]);
  useEffect(() => saveKeys(keys), [keys]);
  const bindings = useMemo(() => effective(keys), [keys]);
  const keyFor = useCallback((cmd: string) => (bindings[cmd] || []).slice(0, 1).map(keyLabel).join("") || "no key", [bindings]);
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
    if (!tl || !selection.length) return;
    const s = E.activeSeq(tl);
    const keep = selection.filter((id) => X.locate(s, id));
    if (keep.length !== selection.length) setSelection(keep);
  }, [tl, selection]);
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
  /** Split selected clips (and what's linked to them) at the playhead; with nothing selected, every unlocked track. */
  const splitAtPlayhead = useCallback(() => {
    const cur = tlRef.current!;
    const ph = programT.frameTime();
    const s = E.activeSeq(cur);
    const under = selection.filter((id) => { const f = X.locate(s, id); return f && ph > f.clip.start && ph < E.clipEnd(f.clip); });
    const tracks = under.length ? [...new Set(X.withLinked(s, under).map((id) => X.locate(s, id)!.track.id))] : undefined;
    const r = X.blade(cur, ph, tracks);
    if (!r.ok) return flash("Put the playhead over a clip to split it.");
    commit(r.timeline);
    if (under.length) {
      // keep the right-hand pieces selected, like Premiere
      const ns = E.activeSeq(r.timeline);
      setSelection(ns.tracks.filter((t) => tracks!.includes(t.id)).flatMap((t) => t.clips.filter((c) => Math.abs(c.start - ph) < 1e-3).map((c) => c.id)));
    }
  }, [selection, commit, flash, programT]);

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
    else if (action === "select-all") { if (typing) document.execCommand("selectAll"); else runRef.current("select-all"); }
    else if (action === "palette") setPalette(true);
    else if (action === "shortcuts") setShowKeys(true);
  }), [importDialog, undo, redo, startExport]);

  // ------------------------------------------------------------------ commands (keys, ⌘K palette, menus)
  /** Apply an editing result: commit, select what it made, report why it couldn't. */
  const apply = useCallback((r: X.Result, opts: { select?: string[]; note?: string } = {}) => {
    if (!r.ok) { flash(r.message || "Couldn't do that.", "warn"); return false; }
    const sel = opts.select ?? r.ids?.filter((id) => /^c\d+$/.test(id));
    commit(r.timeline, { select: sel?.[0] ?? null });
    if (sel) setSelection(sel);
    if (r.message || opts.note) flash(r.message || opts.note!, r.message ? "warn" : "info");
    return true;
  }, [commit, flash]);

  /** The source for Insert/Overwrite: the media in the Source monitor, its In/Out, and the timeline's. */
  const threePoint = useCallback(() => {
    const cur = tlRef.current!;
    const m = sourceMediaRef.current;
    if (!m) { flash("Open a clip in the Source monitor first (click it in Media), mark In/Out, then insert."); return null; }
    const st = mediaStatusRef.current[m.id];
    if (st && !st.online) { flash(`${m.name} is offline. Reconnect the drive or Relink it first.`, "warn"); return null; }
    const s = E.activeSeq(cur);
    const dur = m.type === "image" ? 3 : m.duration ?? 3;
    const tp = X.threePoint(marksRef.current[m.id] || {}, dur, s.marks || {}, programT.frameTime());
    return { src: { media: m.id, in: tp.in, out: tp.out }, at: tp.at, len: tp.len };
  }, [flash, programT]);

  const underPlayhead = useCallback((t: number) => {
    const s = E.activeSeq(tlRef.current!);
    const pref = [selection[0], ...s.tracks.filter((x) => x.id === lastTrack || x.targeted).flatMap((x) => x.clips.map((c) => c.id))];
    for (const id of pref) { const f = id && X.locate(s, id); if (f && t >= f.clip.start - 1e-6 && t < E.clipEnd(f.clip)) return f; }
    const hit = E.clipsAt(tlRef.current!, t)[0];
    return hit ? { clip: hit.clip, track: hit.track } : null;
  }, [selection, lastTrack]);

  const openSequence = useCallback((id: string) => {
    const cur = tlRef.current!;
    if (id === cur.activeSequence) return;
    programT.pause();
    commit(E.setActiveSequence(cur, id));
    setSelection([]);
    programT.seek(0);
  }, [commit, programT]);

  const run = useCallback((cmd: string) => {
    const cur = tlRef.current;
    if (!cur) return;
    const s = E.activeSeq(cur);
    const T = monitorRef.current === "source" && sourceMediaRef.current ? sourceT : programT;
    const ph = programT.frameTime();
    const isSource = T === sourceT;
    const srcM = sourceMediaRef.current;
    const setTlMarks = (m: X.Marks | null) => apply(X.setMarks(cur, m), { select: selection });
    const setSrcMarks = (patch: { in?: number; out?: number } | null) => srcM && setMarks((mk) => {
      if (!patch) { const n = { ...mk }; delete n[srcM.id]; return n; }
      const merged = { ...mk[srcM.id], ...patch };
      for (const k of Object.keys(patch) as ("in" | "out")[]) if (patch[k] === undefined) delete merged[k];
      return { ...mk, [srcM.id]: merged };
    });
    const tool = TOOLS.find((x) => x.cmd === cmd);
    if (tool) { setTool(tool.id); return; }
    switch (cmd) {
      case "play": T.toggle(); break;
      case "shuttle-fwd": T.shuttle(1); break;
      case "shuttle-back": T.shuttle(-1); break;
      case "stop": T.pause(); break;
      case "frame-back": T.step(-1); break;
      case "frame-fwd": T.step(1); break;
      case "second-back": T.step(-T.fps); break;
      case "second-fwd": T.step(T.fps); break;
      case "go-start": T.pause(); T.seek(0); break;
      case "go-end": T.pause(); T.seek(T.duration); break;
      case "prev-edit": case "next-edit": programT.pause(); programT.seek(X.nextEditPoint(s, ph, cmd === "next-edit" ? 1 : -1)); activate("program"); break;
      case "go-timecode": setTcEntry(""); break;
      case "mark-in": if (isSource) setSrcMarks({ in: T.frameTime() }); else setTlMarks({ in: ph }); break;
      case "mark-out": if (isSource) setSrcMarks({ out: T.frameTime() }); else setTlMarks({ out: ph }); break;
      case "clear-in": if (isSource) setSrcMarks({ in: undefined }); else setTlMarks({ ...(s.marks || {}), in: undefined }); break;
      case "clear-out": if (isSource) setSrcMarks({ out: undefined }); else setTlMarks({ ...(s.marks || {}), out: undefined }); break;
      case "clear-marks": if (isSource) setSrcMarks(null); else setTlMarks(null); break;
      case "mark-clip": { const f = underPlayhead(ph); if (f) setTlMarks({ in: f.clip.start, out: E.clipEnd(f.clip) }); else flash("No clip under the playhead."); break; }
      case "insert": case "overwrite": case "append": {
        const tp = threePoint(); if (!tp) break;
        const r = cmd === "insert" ? X.insert(cur, tp.src, tp.at) : cmd === "overwrite" ? X.overwrite(cur, tp.src, tp.at) : X.append(cur, tp.src);
        if (apply(r)) {
          // park the playhead after the new shot (the transport learns the new length first)
          const end = (cmd === "append" ? sequenceDuration(s) : tp.at) + tp.len;
          programT.setDuration(sequenceDuration(E.activeSeq(r.timeline)), s.fps);
          programT.pause(); programT.seek(end); activate("program");
        }
        break;
      }
      case "replace": {
        const tp = threePoint(); if (!tp) break;
        if (!selection[0]) { flash("Select the clip to replace."); break; }
        apply(X.replace(cur, selection[0], tp.src));
        break;
      }
      case "lift": case "extract": {
        const m = s.marks;
        if (m?.in === undefined || m?.out === undefined) { flash("Mark a timeline In and Out first: put the playhead on the timeline and press I, then O."); break; }
        apply(cmd === "lift" ? X.lift(cur, m.in, m.out) : X.extract(cur, m.in, m.out), { select: [] });
        if (cmd === "extract") { programT.pause(); programT.seek(m.in); }
        break;
      }
      case "split": splitAtPlayhead(); break;
      case "split-all": apply(X.blade(cur, ph), { select: selection }); break;
      case "delete":
        if (selection.length) apply(X.remove(cur, selection, false), { select: [] });
        else if (selectedMarker) { apply(X.deleteMarker(cur, selectedMarker), { select: [] }); setSelectedMarker(null); }
        break;
      case "ripple-delete":
        if (selection.length) apply(X.rippleDelete(cur, selection, false), { select: [] });
        else run("close-gap");
        break;
      case "close-gap": {
        const tid = lastTrack && s.tracks.some((x) => x.id === lastTrack) ? lastTrack : X.targetTracks(s).video?.id;
        if (tid) apply(X.closeGap(cur, tid, ph), { select: [] });
        break;
      }
      case "close-all-gaps": {
        const tid = lastTrack && s.tracks.some((x) => x.id === lastTrack) ? lastTrack : X.targetTracks(s).video?.id;
        if (tid) apply(X.closeAllGaps(cur, tid), { select: [] });
        break;
      }
      case "ripple-trim-prev": case "ripple-trim-next": {
        const f = underPlayhead(ph);
        if (!f) { flash("Put the playhead over a clip."); break; }
        const r = cmd === "ripple-trim-prev" ? X.rippleTrim(cur, f.clip.id, "start", ph - f.clip.start, linkedSel) : X.rippleTrim(cur, f.clip.id, "end", ph - E.clipEnd(f.clip), linkedSel);
        if (apply(r, { select: selection }) && cmd === "ripple-trim-prev") { programT.pause(); programT.seek(f.clip.start); }
        break;
      }
      case "nudge-left": case "nudge-right": case "nudge-left-5": case "nudge-right-5": {
        const n = (cmd.includes("left") ? -1 : 1) * (cmd.endsWith("-5") ? 5 : 1);
        apply(X.nudge(cur, selection, n, false), { select: selection });
        break;
      }
      case "link": {
        const linkedNow = selection.some((id) => (X.locate(s, id)?.clip as any)?.link);
        apply(linkedNow ? X.unlink(cur, selection) : X.link(cur, selection), { select: selection, note: linkedNow ? "Unlinked." : "Linked: they now select, move and trim together." });
        break;
      }
      case "linked-selection": setLinkedSel((v) => { flash(`Linked selection ${v ? "off: clicks grab one side" : "on"}.`); return !v; }); break;
      case "nest": {
        const r = X.nest(cur, selection);
        if (apply(r, { select: r.ids ? [r.ids[0]] : [], note: "Nested. Double-click it to open the nested sequence." })) setSelectedMarker(null);
        break;
      }
      case "add-text": addText(); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "copy": case "cut": {
        const d = X.copy(cur, selection);
        if (!d) { flash("Select clips to copy."); break; }
        clipboard.current = d;
        try { navigator.clipboard?.writeText(JSON.stringify(d)); } catch { /* */ }
        if (cmd === "cut") apply(X.remove(cur, selection, false), { select: [] });
        else flash(`Copied ${d.items.length} clip${d.items.length > 1 ? "s" : ""}.`);
        break;
      }
      case "paste": case "paste-insert":
        if (!clipboard.current) { flash("Nothing copied yet."); break; }
        apply(X.paste(cur, clipboard.current, ph, cmd === "paste-insert" ? "insert" : "overwrite"));
        break;
      case "paste-attributes":
        if (!clipboard.current) { flash("Copy a clip first."); break; }
        apply(X.pasteAttributes(cur, clipboard.current, selection), { select: selection, note: "Pasted volume, fades, fit and text style." });
        break;
      case "select-all": setSelection(s.tracks.flatMap((x) => x.clips.map((c) => c.id))); break;
      case "deselect": setSelection([]); setSelectedMarker(null); setTcEntry(null); break;
      case "match-frame": {
        const mf = X.matchFrame(cur, ph, selection[0]);
        if (!mf) { flash("No clip under the playhead."); break; }
        if (mf.seq) { openSequence(mf.seq); programT.seek(mf.time); break; }
        setSourceId(mf.media!); setShowSource(true); activate("source"); sourceT.pause();
        setTimeout(() => sourceT.seek(mf.time), 0);
        flash(`Match frame: ${E.mediaById(cur, mf.media!)?.name} at ${toTimecode(mf.time, s.fps)}`);
        break;
      }
      case "reveal": {
        const f = selection[0] ? X.locate(s, selection[0]) : underPlayhead(ph);
        const mid = f && (f.clip as any).media;
        if (!mid) { flash("Select a clip to find it in Media."); break; }
        setRevealId(mid); setTimeout(() => setRevealId(null), 2500);
        document.querySelector(`[data-media="${mid}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }
      case "marker": case "marker-claude": case "marker-chapter": case "marker-clip": {
        const type = cmd === "marker-claude" ? "claude" : cmd === "marker-chapter" ? "chapter" : "comment";
        let r: X.Result;
        if (cmd === "marker-clip") {
          const f = selection[0] ? X.locate(s, selection[0]) : underPlayhead(ph);
          if (!f) { flash("Select a clip (or put the playhead over one) for a clip marker."); break; }
          r = X.addMarker(cur, { t: (f.clip as any).in + (ph - f.clip.start), type }, f.clip.id);
        } else r = X.addMarker(cur, { t: ph, type, name: type === "chapter" ? `Chapter ${X.allMarkers(s).filter((k) => k.type === "chapter").length + 1}` : "" });
        if (apply(r, { select: selection })) { setSelectedMarker(r.ids![0]); setRightTab("markers"); }
        break;
      }
      case "prev-marker": case "next-marker": {
        const t = X.nextMarker(s, ph, cmd === "next-marker" ? 1 : -1);
        if (t !== null) { programT.pause(); programT.seek(t); activate("program"); }
        break;
      }
      case "copy-chapters": {
        const ch = X.youtubeChapters(s);
        if (!ch.text) { flash(ch.warnings[0], "warn"); break; }
        navigator.clipboard?.writeText(ch.text).catch(() => {});
        flash(ch.warnings.length ? `Chapters copied. ${ch.warnings[0]}` : "YouTube chapters copied.", ch.warnings.length ? "warn" : "info");
        break;
      }
      case "snap": setSnapping((v) => { flash(`Snapping ${v ? "off" : "on"}.`); return !v; }); break;
      case "zoom-in": setZoom((z) => Math.min(400, z * 1.25)); break;
      case "zoom-out": setZoom((z) => Math.max(5, z / 1.25)); break;
      case "zoom-fit": { const w = (document.querySelector(".tl-scroll") as HTMLElement)?.clientWidth || 1000; setZoom(Math.max(5, Math.min(400, (w - 200) / Math.max(5, sequenceDuration(s))))); break; }
      case "palette": setPalette(true); break;
      case "shortcuts": setShowKeys(true); break;
      case "new-sequence": {
        const name = prompt("Name for the new sequence:", "Sequence " + (cur.sequences.length + 1));
        if (name) apply(X.newSequence(cur, name), { select: [] });
        break;
      }
      case "duplicate-version": apply(X.duplicateAsVersion(cur), { select: [], note: "Duplicated as a new version. The old one is untouched in its tab." }); break;
      case "rename-sequence": { const name = prompt("Rename sequence:", s.name); if (name && name !== s.name) apply(X.renameSequence(cur, s.id, name), { select: selection }); break; }
      case "import": importDialog(false); break;
      case "export": startExport(); break;
      default:
        if (cmd.startsWith("open-seq:")) openSequence(cmd.slice(9));
    }
  }, [apply, selection, selectedMarker, lastTrack, linkedSel, flash, threePoint, underPlayhead, openSequence, splitAtPlayhead, addText, undo, redo, importDialog, startExport, sourceT, programT, activate]);
  const runRef = useRef(run);
  runRef.current = run;

  // ------------------------------------------------------------------ keyboard
  const keyMap = useMemo(() => keyIndex(bindings), [bindings]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (palette || showKeys) return;
      const k = eventKey(e);
      // typing a number on the timeline starts "go to timecode" (Premiere-style)
      if (/^[0-9]$/.test(k) && tcEntry === null) { e.preventDefault(); setTcEntry(k); return; }
      const cmd = keyMap.get(k);
      if (!cmd) return;
      // the Mac menu owns these (and copy/paste arrive as DOM events, which also work in a browser)
      if (native && ["undo", "redo", "import", "export", "select-all"].includes(cmd) && ["mod+z", "mod+shift+z", "mod+i", "mod+shift+i", "mod+e", "mod+a"].includes(k)) return;
      if (["copy", "cut", "paste"].includes(cmd) && ["mod+c", "mod+x", "mod+v"].includes(k)) return;
      e.preventDefault();
      if (cmd === "stop") { if (!e.repeat) { programT.kHeld = true; sourceT.kHeld = true; runRef.current("stop"); } return; }
      if (cmd === "import" && e.shiftKey) { importDialog(true); return; }
      runRef.current(cmd);
    };
    const onUp = (e: KeyboardEvent) => { if (keyMap.get(eventKey(e).replace(/^shift\+|^alt\+/, "")) === "stop" || e.key.toLowerCase() === "k") { programT.kHeld = false; sourceT.kHeld = false; } };
    const typing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "");
    const onCopy = (e: ClipboardEvent) => { if (typing() || !selection.length) return; e.preventDefault(); runRef.current(e.type === "cut" ? "cut" : "copy"); };
    const onPaste = (e: ClipboardEvent) => {
      if (typing()) return;
      const text = e.clipboardData?.getData("text/plain");
      try { const d = JSON.parse(text || ""); if (d?.kind === "blkgrlco-clips") clipboard.current = d; } catch { /* not ours: use the in-app copy */ }
      if (!clipboard.current) return;
      e.preventDefault();
      runRef.current("paste");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp);
      document.removeEventListener("copy", onCopy); document.removeEventListener("cut", onCopy); document.removeEventListener("paste", onPaste);
    };
  }, [keyMap, palette, showKeys, tcEntry, selection, importDialog, programT, sourceT]);

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
          {tcEntry !== null ? (
            <input className="timecode tc-entry" data-testid="tc-entry" autoFocus value={tcEntry} placeholder="00:00:00:00  ·  1:05  ·  +2s  ·  -15f"
              onChange={(e) => setTcEntry(e.target.value)}
              onBlur={() => setTcEntry(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setTcEntry(null); return; }
                if (e.key !== "Enter") return;
                const fps = activeT === sourceT ? sourceMedia?.fps || 30 : seq.fps;
                const t = parseTimecode(tcEntry, fps, activeT.frameTime(), /^\d+$/.test(tcEntry.trim()));
                if (t === null) flash(`Couldn't read "${tcEntry}" as a time. Try 00:01:05:12, 1:05, 65s, 120f or +2s.`, "warn");
                else { activeT.pause(); activeT.seek(t); }
                setTcEntry(null);
              }} />
          ) : (
            <span className="timecode" data-testid="timecode" title="Click (or type numbers) to jump to a timecode" onClick={() => setTcEntry("")}>
              {toTimecode(view.time, monitor === "source" && sourceMedia ? sourceMedia.fps || 30 : seq.fps)} <em>/ {toTimecode(activeT.duration, monitor === "source" && sourceMedia ? sourceMedia.fps || 30 : seq.fps)}</em>{rateLabel(view.rate) && <b className="rate">{rateLabel(view.rate)}</b>}
            </span>
          )}
          <span className="which">{monitor === "source" && sourceMedia ? "Source" : "Program"}</span>
        </div>
        <div className="tools">
          <button onClick={() => importDialog(false)} title="Import files by path (⌘I; ⇧⌘I for a folder)">⤓ Import</button>
          <button onClick={splitAtPlayhead} title={`Split at playhead (${keyFor("split")})`}>✂ Split</button>
          <button onClick={() => run("delete")} disabled={!selection.length} title="Delete (⌫) · ripple delete ⇧⌫">🗑</button>
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
      {palette && <CommandPalette keys={keys} onClose={() => setPalette(false)} onRun={(id) => setTimeout(() => runRef.current(id), 0)}
        extra={tl.sequences.filter((sq) => sq.id !== tl.activeSequence).map((sq) => ({ id: `open-seq:${sq.id}`, label: `Open sequence: ${sq.name}`, group: "Sequence" }))} />}
      {showKeys && <ShortcutEditor keys={keys} onChange={setKeys} onClose={() => setShowKeys(false)} />}
      {showExports && <Exports info={exportsInfo} onClose={() => setShowExports(false)} flash={flash} />}

      <aside className="left">
        <MediaBin tl={tl} status={mediaStatus} queue={queueInfo} importing={importing} selectedId={revealId || sourceId}
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
            <Viewer kind="program" tl={playTl!} fonts={fonts} engine={engine} transport={programT} status={mediaStatus} quality={quality}
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
          <button className={rightTab === "markers" ? "on" : ""} onClick={() => setRightTab("markers")} data-testid="tab-markers">Markers{seq.markers.length ? ` (${X.allMarkers(seq).length})` : ""}</button>
        </div>
        {rightTab === "clip" ? <Inspector tl={tl} selected={selected} fonts={fonts} onCommit={commit} />
          : rightTab === "mixer" ? <Mixer tl={tl} audio={audio} onCommit={commit} />
          : <Markers tl={tl} onCommit={commit} flash={flash} selectedMarker={selectedMarker} setSelectedMarker={setSelectedMarker} onJump={(t) => { programT.pause(); programT.seek(t); activate("program"); }} />}
        <History history={history} now={now} undoState={undoState} onJump={jumpTo}
          onRevert={(r) => runHistory(() => api.revert(r))} onRestore={(r) => { if (confirm(`Make the timeline look exactly like it did at rev ${r}? (You can undo this.)`)) runHistory(() => api.restore(r)); }} />
      </aside>
      <section className="bottom" onPointerDown={() => activate("program")}>
        <div className="seq-tabs">
          {tl.sequences.map((sq) => {
            const nestedIn = tl.sequences.some((o) => o.tracks.some((t) => t.clips.some((c) => E.isNested(c) && c.seq === sq.id)));
            return (
              <button key={sq.id} className={sq.id === tl.activeSequence ? "active" : ""} data-seq={sq.id}
                onClick={() => sq.id !== tl.activeSequence && openSequence(sq.id)}
                onDoubleClick={() => { const name = prompt("Rename sequence:", sq.name); if (name && name !== sq.name) apply(X.renameSequence(tl, sq.id, name), { select: [] }); }}
                title={`${sq.name}${nestedIn ? " (used as a nested clip)" : ""} · double-click to rename`}>
                {nestedIn ? "▣ " : ""}{sq.name} <em>{sq.width}×{sq.height}</em>
                {tl.sequences.length > 1 && sq.id === tl.activeSequence && (
                  <span className="seq-x" title="Delete this sequence" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the sequence "${sq.name}"? (You can undo this.)`)) apply(X.deleteSequence(tl, sq.id), { select: [] }); }}>×</span>
                )}
              </button>
            );
          })}
          <button className="ghost" title="New empty sequence" onClick={() => run("new-sequence")}>+ New</button>
          <button className="ghost" title={`Duplicate as a new version, e.g. Main → Main v2 (${keyFor("duplicate-version")})`} onClick={() => run("duplicate-version")}>Duplicate as version</button>
          <span className="spacer" />
          <button className="ghost" onClick={() => setPalette(true)} title="Every command, searchable">⌘ Commands ({keyFor("palette")})</button>
          <button className="ghost" onClick={() => setShowKeys(true)} title="Keyboard shortcuts: presets and your own">⌨ Shortcuts</button>
        </div>
        <Timeline_ tl={tl} transport={programT}
          selection={selection} setSelection={setSelection} zoom={zoom} setZoom={setZoom}
          onCommit={commit} onDropMedia={(id, track, start) => addMedia(id, track, start)} recent={recent} status={mediaStatus}
          tool={tool} setTool={setTool} snapping={snapping} setSnapping={setSnapping} linkedSel={linkedSel} setLinkedSel={setLinkedSel}
          onOpenSequence={openSequence} flash={flash} onLaneClick={setLastTrack} lastTrack={lastTrack}
          selectedMarker={selectedMarker} setSelectedMarker={setSelectedMarker} keyFor={keyFor} />
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
