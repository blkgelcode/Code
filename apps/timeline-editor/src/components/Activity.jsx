import React from "react";
import { fmtClock, AUTHOR } from "../lib/format.js";

/**
 * Who changed what. Each change can be undone on its own ("Undo this"), when
 * nothing after it touched the same clips; undone changes are struck through.
 */
export default function Activity({ activity, history, onUndo, onPick, readOnly }) {
  const items = [...activity].reverse().slice(0, 150);
  const applied = new Set(history?.applied || []);
  const undone = new Set(history?.undone || []);
  return (
    <section className="activity">
      <div className="panel-head"><h2>Activity</h2></div>
      {!items.length && <p className="muted pad">Changes from you and from Claude show up here.</p>}
      <ul>
        {items.map((e, i) => {
          const a = AUTHOR[e.author] || { label: e.author, color: "var(--muted)" };
          const isUndone = e.seq && undone.has(e.seq);
          return (
            <li key={`${e.ts}-${i}`} className={`${e.invalid ? "invalid" : ""} ${isUndone ? "undone" : ""} ${e.undo ? "is-undo" : ""}`}>
              <div className="act-head">
                <span className="who" style={{ background: a.color }}>{a.label}</span>
                <span className="muted">{fmtClock(e.ts)}{e.seq ? ` · #${e.seq}` : ""}</span>
                {e.invalid && <span className="err">invalid edit</span>}
                {isUndone && <span className="muted">undone</span>}
                <span className="spacer" />
                {e.seq && applied.has(e.seq) && !readOnly && (
                  <button className="link" onClick={() => onUndo(e.seq)} title="Undo just this change">Undo this</button>
                )}
              </div>
              <ul className="changes">
                {e.changes.map((c, j) => (
                  <li key={j} className={c.clipIds?.length ? "pickable" : ""} onClick={() => c.clipIds?.[0] && onPick(c.clipIds[0])}>{c.text}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
