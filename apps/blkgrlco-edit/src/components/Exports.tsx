import React from "react";
import { api, native } from "../api";

// The export queue: what's rendering, what's waiting, what failed, and finished files.
// Exports run one at a time from a snapshot of the sequence taken when you clicked Export,
// so you can keep editing; the queue survives a restart.

const ago = (iso?: string) => {
  if (!iso) return "";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : new Date(iso).toLocaleString();
};
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);

export default function Exports({ info, onClose, flash }: { info: any; onClose: () => void; flash: (t: string, k?: string) => void }) {
  const jobs = [...(info.jobs || [])].reverse();
  const open = (f: { name: string; path: string }) => (native?.reveal ? native.reveal(f.path) : window.open(`/exports/${encodeURIComponent(f.name)}`, "_blank"));
  return (
    <div className="exports-pop" role="dialog" aria-label="Exports">
      <div className="panel-head"><h2>Exports</h2><span className="sub">from the original files, one at a time</span><button className="ghost" onClick={onClose}>✕</button></div>
      {jobs.length === 0 && <p className="empty">Nothing queued. Export MP4 (⌘E) adds the current sequence.</p>}
      <ul className="jobs">
        {jobs.map((j: any) => (
          <li key={j.id} className={`job ${j.state}`} data-testid={`export-${j.state}`}>
            <div className="row">
              <b>{j.seqName}</b><span className="state">{j.state === "running" ? `${Math.round(j.progress * 100)}%` : j.state}</span>
              {(j.state === "queued" || j.state === "running") && <button className="ghost" onClick={async () => { const r = await api.cancelExport(j.id); if (r.status !== 200) flash(r.body.error, "warn"); }}>Cancel</button>}
            </div>
            {j.state === "running" && <div className="bar"><i style={{ width: `${j.progress * 100}%` }} /></div>}
            <div className="sub">{j.name} · queued {ago(j.queuedAt)}{j.error ? ` · ${j.error}` : ""}</div>
          </li>
        ))}
      </ul>
      {info.files?.length > 0 && (
        <>
          <div className="panel-head"><h2>Finished</h2><span className="sub" title={info.dir}>in the project's exports folder</span></div>
          <ul className="files">
            {info.files.map((f: any) => (
              <li key={f.name}><button className="link" onClick={() => open(f)} title={native?.reveal ? "Show in Finder" : "Open"}>{f.name}</button><span className="sub">{mb(f.size)} · {ago(f.at)}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
