import React, { useEffect, useRef, useState } from "react";
import { activeSeq, type Timeline } from "../../shared/model";
import { dbText } from "../../shared/ops";
import * as E from "../edit";
import type { AudioEngine, Meter } from "../engine/audio";

// Channel strips for every track that carries sound, plus the master: live level meters
// (peak bar, RMS, 1.5 s peak hold, in dBFS), the track fader (−∞ to +6 dB), mute and solo.
// Fader moves are edits like any other (they land in timeline.json and in History).

const FLOOR = -60;
const pct = (db: number) => (Number.isFinite(db) ? Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR)) * 100 : 0);
// fader position 0–1 ↔ volume 0–2 on a dB-ish curve (unity at 75%)
const toVol = (p: number) => (p <= 0 ? 0 : Math.pow(10, ((p - 0.75) * 48) / 20));
const toPos = (v: number) => (v <= 0 ? 0 : Math.max(0, Math.min(1, 0.75 + (20 * Math.log10(v)) / 48)));

export default function Mixer({ tl, audio, onCommit }: { tl: Timeline; audio: AudioEngine; onCommit: (t: Timeline) => void }) {
  const seq = activeSeq(tl);
  const tracks = seq.tracks.filter((t) => t.kind === "audio" || (t.kind === "video" && t.clips.some((c) => "media" in c && tl.media.find((m) => m.id === c.media)?.hasAudio)));
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const ms: Meter[] = audio.meters();
      for (const m of ms) {
        const el = refs.current.get(m.id);
        if (!el) continue;
        (el.querySelector(".lvl") as HTMLElement).style.height = `${pct(m.peak)}%`;
        (el.querySelector(".rms") as HTMLElement).style.height = `${pct(m.rms)}%`;
        const hold = el.querySelector(".hold") as HTMLElement;
        hold.style.bottom = `${pct(m.hold)}%`;
        hold.classList.toggle("clip", m.hold > -0.5);
        el.dataset.peak = Number.isFinite(m.peak) ? m.peak.toFixed(1) : "-inf";
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [audio]);

  const meter = (id: string) => (
    <div className="meter" ref={(el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); }} data-testid={`meter-${id}`}>
      <div className="rms" /><div className="lvl" /><div className="hold" />
      <div className="ticks">{[0, -6, -12, -24, -48].map((d) => <span key={d} style={{ bottom: `${pct(d)}%` }}>{d}</span>)}</div>
    </div>
  );

  return (
    <div className="panel mixer">
      <div className="panel-head"><h2>Mixer</h2><span className="sub">{seq.name} · plays at 1× only</span></div>
      {tracks.length === 0 && <p className="empty">Tracks with sound show up here.</p>}
      <div className="strips">
        {tracks.map((t) => (
          <div key={t.id} className={`strip ${t.muted ? "muted" : ""}`}>
            <div className="strip-name" title={t.name}>{t.name}</div>
            <div className="strip-body">
              {meter(t.id)}
              <Fader name={t.name} volume={t.volume ?? 1}
                onLive={(v) => audio.previewTrackVolume(t.id, v)}
                onDone={(v) => onCommit(E.updateTrack(tl, t.id, { volume: v }))} />
            </div>
            <div className="strip-db">{dbText(t.volume ?? 1)}</div>
            <div className="strip-btns">
              <button className={t.muted ? "on" : ""} onClick={() => onCommit(E.updateTrack(tl, t.id, { muted: !t.muted }))}>M</button>
              <button className={t.solo ? "on solo" : ""} onClick={() => onCommit(E.updateTrack(tl, t.id, { solo: !t.solo }))}>S</button>
            </div>
          </div>
        ))}
        <div className="strip master">
          <div className="strip-name">Master</div>
          <div className="strip-body">{meter("master")}</div>
          <div className="strip-db">dBFS</div>
        </div>
      </div>
    </div>
  );
}

/** Moves the sound live while dragging; saves one edit when you let go. */
function Fader({ name, volume, onLive, onDone }: { name: string; volume: number; onLive: (v: number) => void; onDone: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? toPos(volume);
  const finish = () => {
    if (draft === null) return;
    const v = Math.round(toVol(draft) * 1000) / 1000;
    setDraft(null);
    if (v !== volume) onDone(v);
  };
  return (
    <input className="fader" type="range" min={0} max={1} step={0.005} value={shown} aria-label={`${name} fader`}
      title="Drag to set the level · double-click: back to 0 dB"
      onChange={(e) => { const p = Number(e.target.value); setDraft(p); onLive(toVol(p)); }}
      onPointerUp={finish} onKeyUp={finish} onBlur={finish}
      onDoubleClick={() => { setDraft(null); onLive(1); onDone(1); }} />
  );
}
