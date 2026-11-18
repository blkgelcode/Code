import React, { useState } from "react";

// The shared history: every change by you, Claude or the app, newest first.
// Each entry can be reverted on its own; "Restore" rewinds the whole timeline to that point.
// Both are recorded as new changes, so nothing is ever lost and both can be undone.

export interface HistoryEntry {
  rev: number; at: string; author: "you" | "claude" | "app"; kind: string; ref?: number; note?: string;
  changes: { text: string; clipId?: string }[]; opCount: number; undone?: boolean;
}

const WHO: Record<string, string> = { you: "You", claude: "Claude", app: "App" };
const KIND: Record<string, string> = { undo: "undo", redo: "redo", revert: "revert", restore: "restore", recover: "recovered", init: "start" };

function ago(at: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

export default function History({ history, now, undoState, onJump, onRevert, onRestore }: {
  history: HistoryEntry[]; now: number; undoState: any;
  onJump: (clipId?: string) => void; onRevert: (rev: number) => void; onRestore: (rev: number) => void;
}) {
  const [filter, setFilter] = useState<"all" | "you" | "claude">("all");
  const items = [...history].reverse().filter((e) => filter === "all" || e.author === filter).slice(0, 150);
  return (
    <div className="panel activity">
      <div className="panel-head">
        <h2>History</h2>
        <div className="filters">
          {(["all", "you", "claude"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : WHO[f]}</button>
          ))}
        </div>
      </div>
      <div className="undo-hint">
        ⌘Z undoes <b>your</b> last change{undoState?.claude?.undo ? <> · ask Claude “undo that” to undo <b>Claude’s</b></> : ""}
      </div>
      {items.length === 0 && <p className="empty">Changes from you and from Claude show up here.</p>}
      <ul>
        {items.map((e) => (
          <li key={e.rev} className={`by-${e.author} ${now - new Date(e.at).getTime() < 6000 ? "fresh" : ""} ${e.undone ? "undone" : ""}`}>
            <div className="who">
              <span className={`badge ${e.author}`}>{WHO[e.author] || e.author}</span>
              {KIND[e.kind] && <span className="kind">{KIND[e.kind]}{e.ref !== undefined ? ` of #${e.ref}` : ""}</span>}
              {e.undone && <span className="kind">undone</span>}
              <span className="rev">#{e.rev}</span>
              <time title={new Date(e.at).toLocaleString()}>{ago(e.at, now)}</time>
            </div>
            <ul className="changes">
              {e.changes.map((c, i) => <li key={i} className={c.clipId ? "link" : ""} onClick={() => onJump(c.clipId)}>{c.text}</li>)}
              {e.note && <li className="note">{e.note}</li>}
            </ul>
            <div className="entry-actions">
              {e.opCount > 0 && !e.undone && !["undo", "init", "recover"].includes(e.kind) && <button onClick={() => onRevert(e.rev)} title="Undo just this change">Revert</button>}
              <button onClick={() => onRestore(e.rev)} title="Make the whole timeline look like it did right after this change">Restore to here</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
