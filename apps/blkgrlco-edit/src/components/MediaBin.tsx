import React from "react";
import { fmtTime } from "../api";
import { mediaName, type Timeline, type Media } from "../../shared/model";
import { badges, headline, usable, ver, type MediaStatus, type QueueInfo } from "../media";

const ICON: Record<string, string> = { video: "🎞", audio: "🎵", image: "🖼" };

export default function MediaBin({ tl, status, queue, importing, selectedId, onImport, onAdd, onOpen, onRetry, onRelink }: {
  tl: Timeline; status: Record<string, MediaStatus>; queue: QueueInfo | null;
  importing: { done: number; total: number; failed: number } | null; selectedId: string | null;
  onImport: (folder?: boolean) => void; onAdd: (mediaId: string) => void; onOpen: (mediaId: string) => void;
  onRetry: (m: Media) => void; onRelink: (m: Media) => void;
}) {
  const used = new Map<string, number>();
  for (const s of tl.sequences) for (const t of s.tracks) for (const c of t.clips) if ("media" in c) used.set(c.media, (used.get(c.media) || 0) + 1);
  const busy = queue ? queue.running + queue.queued : 0;
  return (
    <div className="panel media-bin">
      <div className="panel-head">
        <h2>Media</h2>
        <button onClick={() => onImport(false)} title="Import files by path (⌘I)">+ Files</button>
        <button onClick={() => onImport(true)} title="Import a whole folder (⇧⌘I)">+ Folder</button>
      </div>
      {importing && importing.total > 0 && (
        <div className="import-bar" title="Reading file details with ffprobe">
          <span>Reading {importing.done}/{importing.total} files{importing.failed ? ` · ${importing.failed} unreadable` : ""}</span>
          <div className="bar"><i style={{ width: `${(importing.done / importing.total) * 100}%` }} /></div>
        </div>
      )}
      {queue && (
        <div className={`queue-info ${busy ? "busy" : ""}`} title={`At most ${queue.max} at a time, at low priority, so editing stays smooth. Encoder: ${queue.encoder}.`}>
          {busy ? `Making previews: ${queue.running} running · ${queue.queued} waiting` : tl.media.length ? "All previews ready" : ""}
          {queue.encoder === "hardware" ? <em> · hardware</em> : queue.encoder === "software" ? <em> · software</em> : null}
        </div>
      )}
      {tl.media.length === 0 && !importing && (
        <p className="empty">Import files or a folder, or drag them in from Finder. Footage is used where it is (even on the T7) and never copied. Previews are made in the background.</p>
      )}
      <ul>
        {tl.media.map((m) => {
          const st = status[m.id];
          const h = headline(m, st);
          const ok = usable(m, st) && st?.online !== false;
          const img = m.type === "audio" ? `/api/media/${m.id}/wave?v=${ver(st?.wave)}` : `/api/media/${m.id}/thumb?v=${ver(st?.thumb)}`;
          return (
            <li key={m.id} className={`${h.kind} ${ok ? "" : "not-ready"} ${selectedId === m.id ? "in-source" : ""}`} draggable={ok}
              onClick={() => ok && onOpen(m.id)}
              onDragStart={(e) => { e.dataTransfer.setData("application/x-blkgrlco-media", m.id); e.dataTransfer.effectAllowed = "copy"; }}
              onDoubleClick={() => ok && onAdd(m.id)}
              title={`${m.path}${m.camera ? `\n${m.camera}` : ""}${m.size ? `\n${(m.size / 1e9).toFixed(2)} GB` : ""}\n${ok ? "Click to view it in the Source monitor · drag onto a track · double-click to add it at the end" : h.text}`}>
              <div className="thumb">
                <img src={img} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} onLoad={(e) => (e.currentTarget.style.visibility = "visible")} />
                {h.kind === "offline" && <span className="thumb-flag">OFFLINE</span>}
              </div>
              <div className="meta">
                <div className="file">{ICON[m.type]} {mediaName(m)}</div>
                <div className="facts">
                  <b>{m.id}</b>{m.duration ? ` · ${fmtTime(m.duration, true)}` : ""}{used.get(m.id) ? ` · used ×${used.get(m.id)}` : ""}
                </div>
                <div className="badges">{badges(m).map((b) => <span key={b} className={/HDR|10-bit|12-bit/.test(b) ? "hot" : ""}>{b}</span>)}</div>
                <div className={`status ${h.kind}`}>
                  {h.progress !== undefined && <div className="bar"><i style={{ width: `${h.progress * 100}%` }} /></div>}
                  <span>{h.text}</span>
                  {h.kind === "error" && <button onClick={() => onRetry(m)}>Retry</button>}
                  {h.kind === "offline" && <button onClick={() => onRelink(m)}>Relink…</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
