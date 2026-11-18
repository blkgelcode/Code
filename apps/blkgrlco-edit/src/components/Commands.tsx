// ⌘K command palette and the keyboard-shortcut editor.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { COMMANDS, PRESETS, conflicts, effective, eventKey, keyLabel, type KeySettings, type Preset } from "../keymap";

/** Fuzzy-ish match: every word of the query appears in the label (or the group). */
const matches = (q: string, label: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => label.toLowerCase().includes(w));

export function CommandPalette({ keys, onRun, onClose, extra = [] }: {
  keys: KeySettings; onRun: (id: string) => void; onClose: () => void;
  extra?: { id: string; label: string; group: string }[];   // e.g. "Open sequence: Shorts"
}) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const b = effective(keys);
  const list = useMemo(() => [...extra, ...COMMANDS].filter((c) => c.id !== "palette" && matches(q, `${c.label} ${c.group}`)).slice(0, 60), [q, extra]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }, [i]);
  const run = (id: string) => { onClose(); onRun(id); };
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()} data-testid="palette">
        <input autoFocus placeholder="Type a command… (split, insert, chapter, Shorts…)" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            else if (e.key === "Enter" && list[i]) run(list[i].id);
            else if (e.key === "Escape") onClose();
          }} />
        <div className="palette-list" ref={listRef}>
          {list.map((c, n) => (
            <div key={c.id} className={`palette-item ${n === i ? "on" : ""}`} onPointerEnter={() => setI(n)} onClick={() => run(c.id)}>
              <span className="g">{c.group}</span> {c.label}
              <span className="k">{(b[c.id] || []).slice(0, 2).map(keyLabel).join("  ")}</span>
            </div>
          ))}
          {!list.length && <div className="palette-empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

export function ShortcutEditor({ keys, onChange, onClose }: { keys: KeySettings; onChange: (k: KeySettings) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rec, setRec] = useState<string | null>(null); // command waiting for a key
  const b = effective(keys);
  useEffect(() => {
    if (!rec) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") return setRec(null);
      const k = eventKey(e);
      if (!k || ["mod", "alt", "shift", "ctrl"].includes(k)) return; // only a modifier so far
      // a key belongs to one command: take it from any other
      const custom = { ...keys.custom };
      for (const other of conflicts(b, k, rec)) custom[other] = (b[other] || []).filter((x) => x !== k);
      custom[rec] = [k, ...(b[rec] || []).filter((x) => x !== k)].slice(0, 2);
      onChange({ ...keys, custom });
      setRec(null);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [rec, keys, b, onChange]);
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="shortcuts" onPointerDown={(e) => e.stopPropagation()} data-testid="shortcuts">
        <div className="shortcuts-head">
          <b>Keyboard shortcuts</b>
          <select value={keys.preset} onChange={(e) => onChange({ preset: e.target.value as Preset, custom: {} })} title="Switching presets clears your own changes">
            {Object.entries(PRESETS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select>
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ghost" disabled={!Object.keys(keys.custom).length} onClick={() => onChange({ ...keys, custom: {} })}>Reset my changes</button>
          <button onClick={onClose}>Done</button>
        </div>
        <div className="shortcuts-body">
          {groups.map((g) => {
            const cmds = COMMANDS.filter((c) => c.group === g && matches(q, `${c.label} ${(b[c.id] || []).map(keyLabel).join(" ")}`));
            if (!cmds.length) return null;
            return (
              <div key={g} className="sc-group">
                <h4>{g}</h4>
                {cmds.map((c) => (
                  <div key={c.id} className={`sc-row ${keys.custom[c.id] ? "custom" : ""}`}>
                    <span>{c.label}</span>
                    <button className={`sc-key ${rec === c.id ? "rec" : ""}`} onClick={() => setRec(c.id)} title="Click, then press the new shortcut">
                      {rec === c.id ? "press keys…" : (b[c.id] || []).map(keyLabel).join("  ") || "—"}
                    </button>
                    {keys.custom[c.id] && <button className="ghost small" title="Back to the preset's key" onClick={() => { const custom = { ...keys.custom }; delete custom[c.id]; onChange({ ...keys, custom }); }}>↺</button>}
                    {(b[c.id] || []).length > 0 && <button className="ghost small" title="Remove the shortcut" onClick={() => onChange({ ...keys, custom: { ...keys.custom, [c.id]: [] } })}>×</button>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
