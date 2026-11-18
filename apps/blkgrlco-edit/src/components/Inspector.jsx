import React, { useEffect, useState } from "react";
import * as ops from "../ops.js";
import { fmtTime } from "../api.js";

// Edits the selected clip. Number fields commit on Enter or blur, so typing "12.5"
// doesn't write five versions of timeline.json.
function NumField({ label, value, step = 0.1, min, max, onChange, suffix }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  const done = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n);
    else setV(String(value ?? ""));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

export default function Inspector({ tl, selected, fonts, onCommit }) {
  const f = selected ? ops.findClip(tl, selected) : null;
  if (!f) {
    return (
      <div className="panel inspector">
        <div className="panel-head"><h2>Clip</h2></div>
        <p className="empty">Select a clip to edit it. Space plays, S splits at the playhead, ⌫ deletes, ⌘Z undoes.</p>
      </div>
    );
  }
  const { clip, track } = f;
  const m = clip.media ? ops.mediaById(tl, clip.media) : null;
  const set = (patch) => onCommit(ops.updateClip(tl, clip.id, patch));
  const len = ops.clipDuration(clip);
  const isText = clip.text !== undefined;
  const s = clip.style || {};

  return (
    <div className="panel inspector">
      <div className="panel-head"><h2>Clip {clip.id}</h2><span className="sub">{track.name}</span></div>
      {m && <div className="src">{m.file} · {m.duration ? `${m.duration.toFixed(2)}s source` : "still image"}</div>}
      <div className="grid">
        <NumField label="Start" value={clip.start} min={0} onChange={(v) => set({ start: ops.r3(v) })} suffix={fmtTime(clip.start, true)} />
        {isText ? (
          <NumField label="Length" value={clip.duration} min={ops.MIN_LEN} onChange={(v) => set({ duration: ops.r3(v) })} />
        ) : (
          <>
            <NumField label="In" value={clip.in} min={0} max={clip.out - ops.MIN_LEN} onChange={(v) => set({ in: ops.r3(v) })} />
            <NumField label="Out" value={clip.out} min={clip.in + ops.MIN_LEN} max={m?.type === "image" ? undefined : m?.duration} onChange={(v) => set({ out: ops.r3(v) })} />
            <div className="field ro"><span>Length</span><b>{len.toFixed(2)}s</b></div>
          </>
        )}
        <NumField label="Fade in" value={clip.fadeIn || 0} min={0} onChange={(v) => set({ fadeIn: ops.r3(v) })} suffix="s" />
        <NumField label="Fade out" value={clip.fadeOut || 0} min={0} onChange={(v) => set({ fadeOut: ops.r3(v) })} suffix="s" />
        {!isText && m?.type !== "image" && (
          <label className="field wide">
            <span>Volume</span>
            <input type="range" min="0" max="2" step="0.05" value={clip.volume ?? 1} onChange={(e) => set({ volume: Number(e.target.value) })} />
            <em>{Math.round((clip.volume ?? 1) * 100)}%</em>
          </label>
        )}
        {track.kind === "video" && (
          <label className="field">
            <span>Fit</span>
            <select value={clip.fit || "cover"} onChange={(e) => set({ fit: e.target.value })}>
              <option value="cover">cover (fill, crop)</option>
              <option value="contain">contain (whole frame)</option>
            </select>
          </label>
        )}
      </div>

      {isText && (
        <div className="text-edit">
          <label className="field wide"><span>Text</span>
            <TextArea value={clip.text} onChange={(text) => set({ text })} />
          </label>
          <div className="grid">
            <label className="field"><span>Font</span>
              <select value={s.font || "default"} onChange={(e) => set({ style: { font: e.target.value } })}>
                <option value="default">default (Arial)</option>
                {fonts.map((ft) => <option key={ft.key} value={ft.key}>{ft.key}{ft.source === "brand" ? " ★" : ""}</option>)}
              </select>
            </label>
            <NumField label="Size" value={s.size} step={2} min={4} onChange={(v) => set({ style: { size: v } })} suffix="px" />
            <label className="field"><span>Color</span>
              <input type="color" value={s.color || "#ffffff"} onChange={(e) => set({ style: { color: e.target.value } })} />
              <em>{s.color}</em>
            </label>
            <label className="field"><span>Align</span>
              <select value={s.align || "center"} onChange={(e) => set({ style: { align: e.target.value } })}>
                <option>left</option><option>center</option><option>right</option>
              </select>
            </label>
            <NumField label="X" value={s.x} step={0.01} min={0} max={1} onChange={(v) => set({ style: { x: v } })} suffix="0–1" />
            <NumField label="Y" value={s.y} step={0.01} min={0} max={1} onChange={(v) => set({ style: { y: v } })} suffix="0–1" />
            <label className="field check"><span>Bold</span><input type="checkbox" checked={s.bold !== false} onChange={(e) => set({ style: { bold: e.target.checked } })} /></label>
            <label className="field check"><span>Shadow</span><input type="checkbox" checked={!!s.shadow} onChange={(e) => set({ style: { shadow: e.target.checked } })} /></label>
          </div>
        </div>
      )}
    </div>
  );
}

function TextArea({ value, onChange }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onChange(v)} />;
}
