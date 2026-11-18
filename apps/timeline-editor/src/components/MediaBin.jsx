import React, { useEffect, useState } from "react";
import { addMediaClip } from "../lib/model.js";
import { fmtSec } from "../lib/format.js";

export default function MediaBin({ timeline, proxies, readOnly, commit, setNotice }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => fetch("/api/media-files").then((r) => r.json()).then(setFiles).catch(() => {});
  useEffect(() => {
    refresh();
  }, [timeline?.media.length]);

  const importAll = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/import", { method: "POST" }).then((r) => r.json());
      if (!r.ok) setNotice(r.error);
      else if (r.failed.length) setNotice(`Couldn't import: ${r.failed.map((f) => `${f.file} (${f.error})`).join(", ")}`);
      else if (!r.added.length) setNotice("Nothing new in media/.");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const waiting = files.filter((f) => !f.imported).length;
  const media = timeline?.media || [];

  return (
    <section className="bin">
      <div className="panel-head">
        <h2>Media</h2>
        <button onClick={importAll} disabled={busy || readOnly}>{busy ? "Importing…" : `Import${waiting ? ` (${waiting} new)` : ""}`}</button>
      </div>
      {media.length === 0 && (
        <p className="muted pad">Put clips in the <code>media/</code> folder, then press Import.</p>
      )}
      <ul className="media-list">
        {media.map((m) => {
          const p = proxies?.[m.id];
          return (
            <li
              key={m.id}
              draggable={!readOnly}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-media-id", m.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={() => {
                if (readOnly) return;
                const r = addMediaClip(timeline, m.id, null, null);
                if (r) commit(r.timeline);
              }}
              title="Drag onto a track, or double-click to add it at the end"
            >
              <div className={`thumb kind-${m.kind}`} style={m.kind !== "audio" ? { backgroundImage: `url(/thumb/${m.id})` } : null}>
                {m.kind === "audio" && "♪"}
              </div>
              <div className="media-meta">
                <div className="media-name"><b>{m.id}</b> {m.file}</div>
                <div className="muted">
                  {m.kind}{m.duration ? ` · ${fmtSec(m.duration)}` : ""}{m.width ? ` · ${m.width}×${m.height}` : ""}
                  {m.kind === "video" && p && !p.ready && !p.error && ` · preview ${Math.round((p.progress || 0) * 100)}%`}
                  {p?.error && <span className="err"> · {p.error}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
