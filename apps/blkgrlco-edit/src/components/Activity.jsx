import React from "react";

const WHO = { you: "You", claude: "Claude", app: "App" };

function ago(at, now) {
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

export default function Activity({ activity, now, onJump }) {
  const items = [...activity].reverse().slice(0, 80);
  return (
    <div className="panel activity">
      <div className="panel-head"><h2>Activity</h2><span className="sub">who changed what</span></div>
      {items.length === 0 && <p className="empty">Changes from you and from Claude show up here.</p>}
      <ul>
        {items.map((e) => (
          <li key={e.id} className={`by-${e.author} ${now - new Date(e.at).getTime() < 6000 ? "fresh" : ""}`}>
            <div className="who"><span className={`badge ${e.author}`}>{WHO[e.author] || e.author}</span><time>{ago(e.at, now)}</time></div>
            <ul className="changes">
              {e.changes.map((c, i) => (
                <li key={i} className={c.clipId ? "link" : ""} onClick={() => onJump(c)}>{c.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
