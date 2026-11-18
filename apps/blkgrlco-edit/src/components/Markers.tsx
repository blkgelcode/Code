// Markers panel: every sequence and clip marker, editable; chapters → YouTube; notes for Claude.
import React, { useState } from "react";
import * as X from "../../shared/editing";
import { toTimecode } from "../../shared/timecode";
import type { Marker, Timeline } from "../../shared/model";

const TYPES: { id: Marker["type"]; label: string }[] = [
  { id: "comment", label: "Comment" }, { id: "chapter", label: "Chapter" }, { id: "todo", label: "To-do" }, { id: "claude", label: "For Claude" },
];

export default function Markers({ tl, onCommit, onJump, flash, selectedMarker, setSelectedMarker }: {
  tl: Timeline; onCommit: (tl: Timeline) => void; onJump: (t: number) => void; flash: (t: string, k?: string) => void;
  selectedMarker: string | null; setSelectedMarker: (id: string | null) => void;
}) {
  const seq = X.seqOf(tl);
  const all = X.allMarkers(seq);
  const [filter, setFilter] = useState<"all" | Marker["type"]>("all");
  const shown = all.filter((k) => filter === "all" || k.type === filter);
  const set = (id: string, patch: Partial<Omit<Marker, "id">>) => { const r = X.updateMarker(tl, id, patch); if (r.ok) onCommit(r.timeline); };
  const ch = X.youtubeChapters(seq);
  const copyChapters = async () => {
    if (!ch.text) return flash(ch.warnings[0] || "No chapters.", "warn");
    try { await navigator.clipboard.writeText(ch.text); } catch { /* clipboard blocked: shown below anyway */ }
    flash(ch.warnings.length ? `Chapters copied. Heads up: ${ch.warnings[0]}` : "YouTube chapters copied — paste them into the description.", ch.warnings.length ? "warn" : "info");
  };
  return (
    <div className="markers-panel" data-testid="markers">
      <div className="mk-bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">All markers ({all.length})</option>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} ({all.filter((k) => k.type === t.id).length})</option>)}
        </select>
        <button onClick={copyChapters} title="Copy chapter markers as YouTube chapters">Copy chapters</button>
      </div>
      {ch.text && filter === "chapter" && <pre className="chapters">{ch.text}{ch.warnings.length ? `\n\n⚠ ${ch.warnings.join("\n⚠ ")}` : ""}</pre>}
      {!shown.length && <div className="empty">No markers yet. Press M at the playhead (⇧C for a note to Claude).</div>}
      {shown.map((k) => (
        <div key={k.id} className={`mk ${selectedMarker === k.id ? "on" : ""} ${k.done ? "done" : ""}`} onClick={() => { setSelectedMarker(k.id); onJump(k.at); }}>
          <div className="mk-row">
            <select className="mk-color" value={k.color} style={{ background: X.MARKER_COLORS[k.color] }} onClick={(e) => e.stopPropagation()} onChange={(e) => set(k.id, { color: e.target.value as Marker["color"] })} title="Color">
              {Object.keys(X.MARKER_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="mk-tc">{toTimecode(k.at, seq.fps)}{k.duration ? ` +${k.duration.toFixed(1)}s` : ""}</span>
            {k.clipId && <span className="mk-clip" title="Clip marker: moves with the clip">{k.clipId}</span>}
            <select value={k.type} onClick={(e) => e.stopPropagation()} onChange={(e) => set(k.id, { type: e.target.value as Marker["type"] })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {(k.type === "todo" || k.type === "claude") && <input type="checkbox" checked={!!k.done} title="Done" onClick={(e) => e.stopPropagation()} onChange={(e) => set(k.id, { done: e.target.checked || undefined })} />}
            <button className="ghost small" title="Delete marker" onClick={(e) => { e.stopPropagation(); const r = X.deleteMarker(tl, k.id); if (r.ok) onCommit(r.timeline); }}>×</button>
          </div>
          <input className="mk-name" placeholder={k.type === "chapter" ? "Chapter title" : "Name"} defaultValue={k.name} key={`${k.id}-n-${k.name}`}
            onClick={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== k.name && set(k.id, { name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          <textarea className="mk-note" placeholder={k.type === "claude" ? "What should Claude do here?" : "Notes"} defaultValue={k.note || ""} key={`${k.id}-o-${k.note}`} rows={k.note ? 2 : 1}
            onClick={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== (k.note || "") && set(k.id, { note: e.target.value || undefined })} />
          <label className="mk-range" onClick={(e) => e.stopPropagation()}>
            length <input type="number" min="0" step="0.5" defaultValue={k.duration || 0} key={`${k.id}-d-${k.duration}`}
              onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== (k.duration || 0)) set(k.id, { duration: v }); }} /> s
          </label>
        </div>
      ))}
    </div>
  );
}
