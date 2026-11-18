import React from "react";
import { fmtClock, AUTHOR } from "../lib/format.js";

export default function Activity({ activity, onPick }) {
  const items = [...activity].reverse().slice(0, 100);
  return (
    <section className="activity">
      <div className="panel-head"><h2>Activity</h2></div>
      {!items.length && <p className="muted pad">Changes from you and from Claude show up here.</p>}
      <ul>
        {items.map((e, i) => {
          const a = AUTHOR[e.author] || { label: e.author, color: "var(--muted)" };
          return (
            <li key={`${e.ts}-${i}`} className={e.invalid ? "invalid" : ""}>
              <div className="act-head">
                <span className="who" style={{ background: a.color }}>{a.label}</span>
                <span className="muted">{fmtClock(e.ts)}</span>
                {e.invalid && <span className="err">invalid edit</span>}
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
