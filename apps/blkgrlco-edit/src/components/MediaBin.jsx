import React from "react";
import { fmtTime } from "../api.js";

const ICON = { video: "🎞", audio: "🎵", image: "🖼" };
const STATE = { working: "making preview…", pending: "preview queued", error: "preview failed", ready: "", "n/a": "" };

export default function MediaBin({ tl, mediaStates, assetBump, onScan, onAdd }) {
  const used = new Map();
  for (const t of tl.tracks) for (const c of t.clips) if (c.media) used.set(c.media, (used.get(c.media) || 0) + 1);
  return (
    <div className="panel media-bin">
      <div className="panel-head">
        <h2>Media</h2>
        <button onClick={onScan} title="Re-read the media/ folder">⟳ Scan media/</button>
      </div>
      {tl.media.length === 0 && (
        <p className="empty">Copy clips, music or photos into <code>project/media/</code>. They show up here on their own.</p>
      )}
      <ul>
        {tl.media.map((m) => (
          <li key={m.id} draggable
            onDragStart={(e) => { e.dataTransfer.setData("application/x-blkgrlco-media", m.id); e.dataTransfer.effectAllowed = "copy"; }}
            onDoubleClick={() => onAdd(m.id)} title="Drag onto a track, or double-click to add it at the end">
            <div className="thumb">
              {m.type === "audio"
                ? <img src={`/api/wave/${m.id}?v=${assetBump}`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                : <img src={`/api/thumb/${m.id}?v=${assetBump}`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />}
            </div>
            <div className="meta">
              <div className="file">{ICON[m.type]} {m.file}</div>
              <div className="facts">
                <b>{m.id}</b>
                {m.duration ? ` · ${fmtTime(m.duration, true)}` : ""}
                {m.width ? ` · ${m.width}×${m.height}` : ""}
                {used.get(m.id) ? ` · used ×${used.get(m.id)}` : ""}
              </div>
              {STATE[mediaStates[m.id]] && <div className="state">{STATE[mediaStates[m.id]]}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
