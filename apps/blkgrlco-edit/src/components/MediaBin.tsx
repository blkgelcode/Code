import React from "react";
import { fmtTime } from "../api";
import { mediaName, type Timeline } from "../../shared/model";

const ICON: Record<string, string> = { video: "🎞", audio: "🎵", image: "🖼" };
const STATE: Record<string, string> = { working: "making preview…", pending: "preview queued", error: "preview failed", ready: "", "n/a": "" };

export default function MediaBin({ tl, mediaStates, assetBump, onImport, onAdd }: {
  tl: Timeline; mediaStates: Record<string, string>; assetBump: number;
  onImport: (folder?: boolean) => void; onAdd: (mediaId: string) => void;
}) {
  const used = new Map<string, number>();
  for (const s of tl.sequences) for (const t of s.tracks) for (const c of t.clips) if ("media" in c) used.set(c.media, (used.get(c.media) || 0) + 1);
  return (
    <div className="panel media-bin">
      <div className="panel-head">
        <h2>Media</h2>
        <button onClick={() => onImport(false)} title="Import files by path (⌘I)">+ Files</button>
        <button onClick={() => onImport(true)} title="Import a whole folder (⇧⌘I)">+ Folder</button>
      </div>
      {tl.media.length === 0 && (
        <p className="empty">Import files or a folder, or drag them in from Finder. They're used where they are (even on the T7), never copied.</p>
      )}
      <ul>
        {tl.media.map((m) => (
          <li key={m.id} draggable
            onDragStart={(e) => { e.dataTransfer.setData("application/x-blkgrlco-media", m.id); e.dataTransfer.effectAllowed = "copy"; }}
            onDoubleClick={() => onAdd(m.id)} title={`${m.path}\nDrag onto a track, or double-click to add it at the end`}>
            <div className="thumb">
              <img src={`/api/${m.type === "audio" ? "wave" : "thumb"}/${m.id}?v=${assetBump}`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
            </div>
            <div className="meta">
              <div className="file">{ICON[m.type]} {mediaName(m)}</div>
              <div className="facts">
                <b>{m.id}</b>
                {m.duration ? ` · ${fmtTime(m.duration, true)}` : ""}
                {m.width ? ` · ${m.width}×${m.height}` : ""}
                {m.fps ? ` · ${m.fps}fps` : ""}
                {m.codec ? ` · ${m.codec}` : ""}
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
