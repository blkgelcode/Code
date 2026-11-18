// Keeps the browser's copy of the timeline in sync with the server.
//
// Edits are applied locally at once, then sent. Only one write is in flight at a
// time; edits made meanwhile are folded into the next write. If Claude (or anyone
// editing the file) changed the timeline in between, the server refuses the write
// and sends the current state, which replaces ours.
import { useCallback, useEffect, useRef, useState } from "react";

export function useTimelineSync() {
  const [state, setState] = useState({
    connected: false,
    timeline: null,
    errors: [],
    warnings: [],
    media: {}, // mediaId -> { online, ready, jobs, progress, errors } from the server
    activity: [],
    exportStatus: null,
    notice: null,
    lastChange: null, // { author, clipIds, at } for highlighting
  });
  const ws = useRef(null);
  const rev = useRef(0);
  const local = useRef(null); // latest local timeline
  const inflight = useRef(false);
  const dirty = useRef(false);

  const flush = useCallback(() => {
    if (inflight.current || !dirty.current || !ws.current || ws.current.readyState !== 1) return;
    inflight.current = true;
    dirty.current = false;
    ws.current.send(JSON.stringify({ type: "update", baseRev: rev.current, timeline: local.current }));
  }, []);

  useEffect(() => {
    let closed = false;
    let retry;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${location.host}/ws`);
      ws.current = sock;
      sock.onopen = () => setState((s) => ({ ...s, connected: true }));
      sock.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        inflight.current = false;
        if (!closed) retry = setTimeout(connect, 1000);
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") {
          rev.current = msg.rev;
          const fromUs = msg.author === "user" && (inflight.current || dirty.current);
          setState((s) => {
            const next = { ...s, errors: msg.errors || [], warnings: msg.warnings || [] };
            if (msg.activity) next.activity = msg.activity;
            if (msg.entry) next.activity = [...s.activity, msg.entry].slice(-300);
            if (!fromUs) {
              if (dirty.current && msg.author === "claude") next.notice = "Claude changed the timeline; your last edit was replaced.";
              dirty.current = false;
              local.current = msg.timeline;
              next.timeline = msg.timeline;
            }
            if (msg.entry) next.lastChange = { author: msg.author, clipIds: msg.entry.changes.flatMap((c) => c.clipIds), at: Date.now() };
            return next;
          });
        } else if (msg.type === "ack") {
          inflight.current = false;
          if (msg.ok) rev.current = msg.rev;
          else {
            dirty.current = false;
            setState((s) => ({ ...s, notice: msg.error || (msg.errors || []).join("; ") || "Edit refused" }));
          }
          flush();
        } else if (msg.type === "invalid") {
          setState((s) => ({
            ...s,
            errors: msg.errors,
            activity: [...s.activity, { ts: new Date().toISOString(), author: "claude", invalid: true, changes: msg.errors.map((text) => ({ text, clipIds: [] })) }],
          }));
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
    setState((s) => ({ ...s, timeline: next }));
    flush();
    return true;
  }, [flush]);

  const dismissNotice = useCallback(() => setState((s) => ({ ...s, notice: null })), []);
  const setNotice = useCallback((notice) => setState((s) => ({ ...s, notice })), []);
  return { ...state, commit, dismissNotice, setNotice };
}
