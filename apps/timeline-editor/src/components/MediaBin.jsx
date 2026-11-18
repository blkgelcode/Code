import React from "react";
import { addMediaClip } from "../lib/model.js";
import { describeMedia, mediaState } from "../lib/format.js";

export default function MediaBin({ timeline, mediaStatus, readOnly, commit, setNotice, openImport }) {
  const media = timeline?.media || [];
  const working = media.filter((m) => mediaState(mediaStatus[m.id]).busy).length;

  const retry = (id) => fetch(`/api/retry/${id}`, { method: "POST" });

  return (
    <section className="bin">
      <div className="panel-head">
        <h2>Media{working ? <span className="muted"> · preparing {working}</span> : null}</h2>
        <button onClick={openImport} disabled={readOnly}>Import…</button>
      </div>
      {media.length === 0 && (
        <p className="muted pad">
          Drag clips or folders here from Finder, or press Import… to pick them on any drive.
          Files are read where they are; nothing is uploaded or copied.
        </p>
      )}
      <ul className="media-list">
        {media.map((m) => {
          const st = mediaStatus[m.id];
          const s = mediaState(st);
          const usable = s.ready && !readOnly;
          const name = m.file.split("/").pop();
          return (
            <li
              key={m.id}
              className={`${s.offline ? "offline" : ""} ${s.error ? "failed" : ""} ${usable ? "" : "not-ready"}`}
              draggable={usable}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-media-id", m.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={() => {
                if (!usable) return setNotice(s.offline ? `${name} is offline. Reconnect its drive.` : `${name} isn't ready yet (${s.label.toLowerCase()}).`);
                const r = addMediaClip(timeline, m.id, null, null);
                if (r) commit(r.timeline);
              }}
              title={`${st?.path || m.file}\n${usable ? "Drag onto a track, or double-click to add it at the end" : s.label}`}
            >
              <div className={`thumb kind-${m.kind}`} style={st?.jobs?.thumb === "done" ? { backgroundImage: `url(/thumb/${m.id}?k=${st.key})` } : null}>
                {m.kind === "audio" && "♪"}
                {s.offline && <span className="badge offline-badge">OFFLINE</span>}
              </div>
              <div className="media-meta">
                <div className="media-name"><b>{m.id}</b> {name}</div>
                <div className="muted small">{describeMedia(m)}</div>
                <div className={`media-state ${s.error ? "err" : s.offline ? "warn" : ""}`}>
                  {s.busy && <div className="bar"><div style={{ width: `${Math.round((s.progress || 0) * 100)}%` }} /></div>}
                  <span>{s.label}</span>
                  {s.error && <button className="link" onClick={() => retry(m.id)}>Retry</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
