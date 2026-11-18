// Keeps the browser's copy of the timeline in sync with the server.
//
// Edits are applied locally at once, then sent. Only one write is in flight at a
// time; edits made meanwhile are folded into the next write. If Claude (or anyone
// editing the file) changed the timeline in between, the server refuses the write
// and sends the current state, which replaces ours.
//
// An edit that hasn't been confirmed yet is also kept in localStorage, so a browser
// reload, a crash or a server restart doesn't lose it: on reconnect it's sent again
// if the timeline hasn't changed since, and dropped (with a note) if it has.
import { useCallback, useEffect, useRef, useState } from "react";

const PENDING = "timeline-editor:pending";
const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(PENDING) || "null");
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) localStorage.setItem(PENDING, JSON.stringify(v));
      else localStorage.removeItem(PENDING);
    } catch {
      // storage full or blocked: the edit is still in memory
    }
  },
};

export function useTimelineSync() {
  const [state, setState] = useState({
    connected: false,
    timeline: null,
    errors: [],
    warnings: [],
    media: {}, // mediaId -> { online, ready, jobs, progress, errors } from the server
    activity: [],
    history: null, // { rev, canUndo, canRedo, applied, undone }
    canRecover: false,
    exportStatus: null,
    notice: null,
    lastChange: null, // { author, clipIds, at } for highlighting
  });
  const ws = useRef(null);
  const rev = useRef(0);
  const local = useRef(null); // latest local timeline
  const inflight = useRef(false);
  const dirty = useRef(false);
  const fresh = useRef(true); // next state message is the first after (re)connecting

  const send = useCallback((msg) => {
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const flush = useCallback(() => {
    if (inflight.current || !dirty.current) return;
    if (!send({ type: "update", baseRev: rev.current, timeline: local.current })) return;
    inflight.current = true;
    dirty.current = false;
  }, [send]);

  useEffect(() => {
    let closed = false;
    let retry;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${location.host}/ws`);
      ws.current = sock;
      fresh.current = true;
      sock.onopen = () => setState((s) => ({ ...s, connected: true }));
      sock.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (inflight.current) dirty.current = true; // not confirmed: send again after reconnecting
        inflight.current = false;
        if (!closed) retry = setTimeout(connect, 1000);
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") onState(msg);
        else if (msg.type === "ack") {
          inflight.current = false;
          if (msg.ok) {
            rev.current = msg.rev;
            if (!dirty.current) store.set(null);
          } else {
            dirty.current = false;
            store.set(null);
            setState((s) => ({ ...s, notice: msg.error || (msg.errors || []).join("; ") || "Edit refused" }));
          }
          flush();
        } else if (msg.type === "invalid") {
          setState((s) => ({
            ...s,
            errors: msg.errors,
            canRecover: msg.canRecover,
            activity: [...s.activity, { ts: new Date().toISOString(), author: "claude", invalid: true, changes: msg.errors.map((text) => ({ text, clipIds: [] })) }],
          }));
        } else if (msg.type === "notice") {
          setState((s) => ({ ...s, notice: msg.text }));
        } else if (msg.type === "media") {
          setState((s) => {
            if (msg.status) return { ...s, media: msg.status };
            const media = { ...s.media };
            for (const [id, st] of Object.entries(msg.update || {})) {
              if (st) media[id] = st;
              else delete media[id];
            }
            return { ...s, media };
          });
        } else if (msg.type === "export") {
          setState((s) => ({ ...s, exportStatus: msg }));
        }
      };
    };

    const onState = (msg) => {
      const knownRev = rev.current;
      rev.current = msg.rev;
      let adopt = msg.timeline;
      let notice = null;
      if (fresh.current) {
        // first state after connecting: resend an unconfirmed edit if nothing changed meanwhile
        fresh.current = false;
        const pending = dirty.current ? { baseRev: store.get()?.baseRev ?? knownRev, timeline: local.current } : store.get();
        if (pending) {
          if (pending.baseRev === msg.rev && pending.timeline) {
            adopt = pending.timeline;
            local.current = pending.timeline;
            dirty.current = true;
            notice = "An edit that hadn't been saved yet was restored and saved.";
          } else {
            dirty.current = false;
            store.set(null);
            notice = "An edit from before the connection dropped wasn't saved, because the timeline changed meanwhile.";
          }
        }
      }
      const fromUs = msg.author === "user" && (inflight.current || dirty.current);
      setState((s) => {
        const next = { ...s, errors: msg.errors || [], warnings: msg.warnings || [], history: msg.history || s.history, canRecover: Boolean(msg.canRecover) };
        if (msg.activity) next.activity = msg.activity;
        if (msg.entry) next.activity = [...s.activity, msg.entry].slice(-300);
        if (notice) next.notice = notice;
        if (!fromUs) {
          if (dirty.current && msg.author === "claude") {
            next.notice = "Claude changed the timeline; your last edit was replaced.";
            dirty.current = false;
            store.set(null);
          }
          if (adopt === msg.timeline) local.current = msg.timeline;
          next.timeline = adopt;
        }
        if (msg.entry) next.lastChange = { author: msg.author, clipIds: msg.entry.changes.flatMap((c) => c.clipIds || []), at: Date.now() };
        return next;
      });
      flush();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [flush]);

  /** Apply an edit: pass the new timeline (or null to ignore a refused operation). */
  const commit = useCallback((next) => {
    if (!next) return false;
    local.current = next;
    dirty.current = true;
    store.set({ baseRev: rev.current, timeline: next, ts: Date.now() });
    setState((s) => ({ ...s, timeline: next }));
    flush();
    return true;
  }, [flush]);

  const undo = useCallback(() => send({ type: "undo" }), [send]);
  const redo = useCallback(() => send({ type: "redo" }), [send]);
  const undoEntry = useCallback((seq) => send({ type: "undoEntry", seq }), [send]);
  const dismissNotice = useCallback(() => setState((s) => ({ ...s, notice: null })), []);
  const setNotice = useCallback((notice) => setState((s) => ({ ...s, notice })), []);
  return { ...state, commit, undo, redo, undoEntry, dismissNotice, setNotice };
}
