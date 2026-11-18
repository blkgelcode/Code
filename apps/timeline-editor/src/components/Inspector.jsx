import React, { useEffect, useState } from "react";
import { findClip, isTextClip, mediaById, updateClip, updateMedia, updateProject, updateSettings, seqOf, round, linkedPartners, unlinkClip, CHANNELS } from "../lib/model.js";

/** A number field that commits on Enter or blur, so typing doesn't spam writes. */
function Num({ label, value, onCommit, step = 0.1, min, max, disabled }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  const done = () => {
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) return setV(String(value ?? ""));
    if (n !== value) onCommit(round(n));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} min={min} max={max} value={v} disabled={disabled}
        onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </label>
  );
}

export default function Inspector({ timeline, selected, readOnly, commit }) {
  if (!timeline) return <section className="inspector" />;
  const found = selected && findClip(timeline, selected);
  if (!found) return <ProjectSettings timeline={timeline} readOnly={readOnly} commit={commit} />;
  const { clip, track } = found;
  const set = (patch) => commit(updateClip(timeline, clip.id, patch));
  const m = isTextClip(clip) ? null : mediaById(timeline, clip.media);

  return (
    <section className="inspector">
      <div className="panel-head"><h2>{clip.id} <span className="muted">on {track.name}</span></h2></div>
      <div className="fields">
        {m && <div className="muted small">{m.file} · {m.duration ? `${m.duration}s` : m.kind}</div>}
        <Num label="Start (s)" value={clip.start} min={0} onCommit={(v) => set({ start: Math.max(0, v) })} disabled={readOnly} />
        {isTextClip(clip) ? (
          <Num label="Duration (s)" value={clip.duration} min={0.1} onCommit={(v) => set({ duration: Math.max(0.1, v) })} disabled={readOnly} />
        ) : (
          <>
            <Num label="Source in (s)" value={clip.in} min={0} onCommit={(v) => set({ in: v })} disabled={readOnly} />
            <Num label="Source out (s)" value={clip.out} min={0} onCommit={(v) => set({ out: v })} disabled={readOnly} />
            {track.kind === "audio" && <Num label="Volume (1 = 100%)" value={clip.volume} step={0.05} min={0} max={2} onCommit={(v) => set({ volume: v })} disabled={readOnly} />}
          </>
        )}
        <Num label="Fade in (s)" value={clip.fadeIn} min={0} onCommit={(v) => set({ fadeIn: Math.max(0, v) })} disabled={readOnly} />
        <Num label="Fade out (s)" value={clip.fadeOut} min={0} onCommit={(v) => set({ fadeOut: Math.max(0, v) })} disabled={readOnly} />
        {track.kind === "video" && (
          <label className="field">
            <span>Fit</span>
            <select value={clip.fit} disabled={readOnly} onChange={(e) => set({ fit: e.target.value })}>
              <option value="cover">cover (fill, crop edges)</option>
              <option value="contain">contain (whole frame)</option>
            </select>
          </label>
        )}
        {isTextClip(clip) && <TextFields clip={clip} set={set} readOnly={readOnly} />}
        {track.kind === "video" && m?.kind === "video" && <ColorFields timeline={timeline} clip={clip} media={m} set={set} commit={commit} readOnly={readOnly} />}
        {clip.link && (
          <div className="link-row">
            <span className="muted small">⛓ Linked to {linkedPartners(timeline, clip.id).map((p) => p.clip.id).join(", ")}: they move, trim and split together. Hold ⌥ to edit one side alone.</span>
            <button disabled={readOnly} onClick={() => commit(unlinkClip(timeline, clip.id))}>Unlink</button>
          </div>
        )}
      </div>
    </section>
  );
}

function TextFields({ clip, set, readOnly }) {
  const [text, setText] = useState(clip.text);
  useEffect(() => setText(clip.text), [clip.text]);
  const s = clip.style;
  const style = (patch) => set({ style: patch });
  return (
    <>
      <label className="field col">
        <span>Text</span>
        <textarea rows={2} value={text} disabled={readOnly} onChange={(e) => setText(e.target.value)} onBlur={() => text !== clip.text && set({ text })} />
      </label>
      <label className="field">
        <span>Font</span>
        <input key={s.font} defaultValue={s.font} disabled={readOnly} onBlur={(e) => e.target.value && e.target.value !== s.font && style({ font: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </label>
      <Num label="Size (px)" value={s.size} step={2} min={8} onCommit={(v) => style({ size: v })} disabled={readOnly} />
      <label className="field">
        <span>Color</span>
        <input type="color" value={s.color} disabled={readOnly} onChange={(e) => style({ color: e.target.value })} />
      </label>
      <Num label="X (0–1)" value={s.x} step={0.01} min={0} max={1} onCommit={(v) => style({ x: v })} disabled={readOnly} />
      <Num label="Y (0–1)" value={s.y} step={0.01} min={0} max={1} onCommit={(v) => style({ y: v })} disabled={readOnly} />
      <label className="field">
        <span>Align</span>
        <select value={s.align} disabled={readOnly} onChange={(e) => style({ align: e.target.value })}>
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </label>
      <label className="field">
        <span>Background box</span>
        <input type="checkbox" checked={!!s.box} disabled={readOnly}
          onChange={(e) => style({ box: e.target.checked ? { color: "#000000", opacity: 0.5, padding: 20 } : null })} />
      </label>
    </>
  );
}

function ColorFields({ timeline, clip, media, set, commit, readOnly }) {
  const isLog = media.logProfile === "dlogm";
  const input = clip.color?.input ?? "auto";
  const look = clip.color?.look ?? "project";
  const project = timeline.project;
  return (
    <div className="color-box">
      <div className="sub-head">Color</div>
      <label className="field" title="DJI records D-Log M but tags it bt709, so DJI files get this on by default. It applies to every clip of this file.">
        <span>{media.id} is D-Log M</span>
        <input type="checkbox" checked={isLog} disabled={readOnly} onChange={(e) => commit(updateMedia(timeline, media.id, { logProfile: e.target.checked ? "dlogm" : "none" }))} />
      </label>
      {isLog && (
        <label className="field">
          <span>Convert to Rec.709</span>
          <select value={input} disabled={readOnly} onChange={(e) => set({ color: { input: e.target.value } })}>
            <option value="auto">yes (DJI LUT)</option>
            <option value="none">no, keep it flat</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>Look</span>
        <select value={look} disabled={readOnly} onChange={(e) => set({ color: { look: e.target.value } })}>
          <option value="project">project look{project.look === "none" || !project.channel && project.look === "channel" ? " (none set)" : ""}</option>
          <option value="none">none on this clip</option>
        </select>
      </label>
      <p className="muted small">The preview shows the D-Log M conversion. The look is applied on export; the live preview of looks comes with the Color phase.</p>
    </div>
  );
}

const CHANNEL_LOOK = { "@blkgrlco": "The Everyday LUT", "@blkgrlcotakesoff": "The Everyday LUT", podcast: null };

function ProjectSettings({ timeline, readOnly, commit }) {
  const s = seqOf(timeline).settings;
  const p = timeline.project;
  const set = (patch) => commit(updateSettings(timeline, patch));
  const channelLook = CHANNEL_LOOK[p.channel];
  return (
    <section className="inspector">
      <div className="panel-head"><h2>Project</h2></div>
      <div className="fields">
        <p className="muted small">Select a clip to edit it.</p>
        <label className="field">
          <span>Name</span>
          <input key={p.name} defaultValue={p.name} disabled={readOnly} onBlur={(e) => e.target.value && e.target.value !== p.name && commit(updateProject(timeline, { name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </label>
        <label className="field" title="Brand presets come from the brand bible">
          <span>Channel</span>
          <select value={p.channel || ""} disabled={readOnly} onChange={(e) => commit(updateProject(timeline, { channel: e.target.value || null }))}>
            <option value="">none</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Look (creative LUT)</span>
          <select value={p.look === "none" ? "none" : "channel"} disabled={readOnly} onChange={(e) => commit(updateProject(timeline, { look: e.target.value }))}>
            <option value="channel">{channelLook ? `channel: ${channelLook}` : "channel default (none)"}</option>
            <option value="none">none</option>
          </select>
        </label>
        <div className="presets">
          <button disabled={readOnly} className={s.width === 1920 && s.height === 1080 ? "on" : ""} onClick={() => set({ width: 1920, height: 1080 })}>16:9 1920×1080</button>
          <button disabled={readOnly} className={s.width === 1080 && s.height === 1920 ? "on" : ""} onClick={() => set({ width: 1080, height: 1920 })}>9:16 1080×1920</button>
        </div>
        <Num label="Width" value={s.width} step={2} min={16} onCommit={(v) => set({ width: Math.round(v / 2) * 2 })} disabled={readOnly} />
        <Num label="Height" value={s.height} step={2} min={16} onCommit={(v) => set({ height: Math.round(v / 2) * 2 })} disabled={readOnly} />
        <Num label="FPS" value={s.fps} step={1} min={1} onCommit={(v) => set({ fps: v })} disabled={readOnly} />
        <label className="field">
          <span>Background</span>
          <input type="color" value={s.background} disabled={readOnly} onChange={(e) => set({ background: e.target.value })} />
        </label>
      </div>
    </section>
  );
}
