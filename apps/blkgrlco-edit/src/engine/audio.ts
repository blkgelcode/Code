// Audio engine: every clip's sound → clip gain (volume + fades) → track bus (fader, mute, solo)
// → master → speakers, with an analyser on each bus for the meters.
//
// Sound comes from the proxy's AAC track (or the original WAV/MP3 for audio files), streamed with
// range requests by an <audio> element and kept in sync with the program transport. Audio plays
// at normal forward speed; while shuttling (2×, reverse, ¼) or scrubbing it's silent, like most NLEs.
import { activeSeq, clipLength, type Timeline, type MediaClip } from "../../shared/model";
import type { MediaStatus } from "../media";
import type { Transport } from "./transport";

interface Voice { el: HTMLAudioElement; node: MediaElementAudioSourceNode; gain: GainNode; src: string; track: string }
interface Bus { gain: GainNode; analyser: AnalyserNode; buf: Float32Array; peakHold: number; peakAt: number }
export interface Meter { id: string; peak: number; rms: number; hold: number } // dBFS

const DRIFT = 0.12; // s
const dB = (lin: number) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master?: Bus;
  private buses = new Map<string, Bus>();
  private voices = new Map<string, Voice>();
  private tl: Timeline | null = null;
  private status: Record<string, MediaStatus> = {};
  private unsub?: () => void;

  constructor(private transport: Transport) {
    this.unsub = transport.subscribe(() => this.sync());
  }

  /** Browsers only allow audio after a click/keypress: call from one. */
  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.makeBus(this.ctx.destination);
      if (this.tl) this.update(this.tl, this.status);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private makeBus(dest: AudioNode): Bus {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    gain.connect(analyser);
    gain.connect(dest);
    return { gain, analyser, buf: new Float32Array(analyser.fftSize), peakHold: -Infinity, peakAt: 0 };
  }

  /** Rebuild the graph for the active sequence (clips added/removed, faders moved, solo…). */
  update(tl: Timeline, status: Record<string, MediaStatus>) {
    this.tl = tl;
    this.status = status;
    if (!this.ctx || !this.master) return;
    const seq = activeSeq(tl);
    const anySolo = seq.tracks.some((t) => t.kind !== "text" && t.solo);
    const live = new Set<string>();
    const liveBuses = new Set<string>();
    for (const t of seq.tracks) {
      if (t.kind === "text") continue;
      let bus = this.buses.get(t.id);
      if (!bus) { bus = this.makeBus(this.master.gain); this.buses.set(t.id, bus); }
      liveBuses.add(t.id);
      const audible = !t.muted && (!anySolo || t.solo);
      bus.gain.gain.setTargetAtTime(audible ? t.volume ?? 1 : 0, this.ctx.currentTime, 0.015);
      for (const c of t.clips as MediaClip[]) {
        const m = tl.media.find((x) => x.id === c.media);
        if (!m || m.type === "image" || (m.type === "video" && !m.hasAudio)) continue;
        const st = status[m.id];
        const src = m.type === "audio" ? (st?.online === false ? null : `/api/media/${m.id}/original`) : st?.proxy.state === "ready" ? `/api/media/${m.id}/proxy` : null;
        if (!src) continue;
        live.add(c.id);
        let v = this.voices.get(c.id);
        if (v && (v.src !== src || v.track !== t.id)) { this.dropVoice(c.id); v = undefined; }
        if (!v) {
          const el = new Audio();
          el.preload = "auto";
          el.src = src;
          const node = this.ctx.createMediaElementSource(el);
          const gain = this.ctx.createGain();
          gain.gain.value = 0;
          node.connect(gain);
          gain.connect(bus.gain);
          v = { el, node, gain, src, track: t.id };
          this.voices.set(c.id, v);
        }
      }
    }
    for (const id of [...this.voices.keys()]) if (!live.has(id)) this.dropVoice(id);
    for (const [id, b] of this.buses) if (!liveBuses.has(id)) { b.gain.disconnect(); this.buses.delete(id); }
    this.sync();
  }

  private dropVoice(id: string) {
    const v = this.voices.get(id);
    if (!v) return;
    v.el.pause(); v.el.removeAttribute("src"); v.el.load();
    v.node.disconnect(); v.gain.disconnect();
    this.voices.delete(id);
  }

  /** Live fader preview while dragging (the edit is saved on release). */
  previewTrackVolume(trackId: string, v: number) {
    const b = this.buses.get(trackId);
    if (b && this.ctx) b.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  /** Follow the transport: play the clips under the playhead in sync, silence the rest. */
  private sync() {
    if (!this.ctx || !this.tl) return;
    const tr = this.transport;
    const normal = tr.rate === 1;
    const t = tr.time;
    const seq = activeSeq(this.tl);
    for (const track of seq.tracks) {
      for (const c of track.clips as MediaClip[]) {
        const v = this.voices.get(c.id);
        if (!v) continue;
        const len = clipLength(c);
        const local = t - c.start;
        const on = normal && local >= 0 && local < len;
        if (!on) {
          if (!v.el.paused) v.el.pause();
          v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.005);
          // park at the clip's first sample so it starts on time
          if (local < 0 && local > -1 && Math.abs(v.el.currentTime - c.in) > 0.05) v.el.currentTime = c.in;
          continue;
        }
        let g = c.volume;
        if (c.fadeIn > 0 && local < c.fadeIn) g *= local / c.fadeIn;
        if (c.fadeOut > 0 && local > len - c.fadeOut) g *= Math.max(0, (len - local) / c.fadeOut);
        v.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
        const target = c.in + local;
        if (Math.abs(v.el.currentTime - target) > DRIFT) v.el.currentTime = target;
        if (v.el.paused) v.el.play().catch(() => {});
      }
    }
  }

  /** Current levels (dBFS): peak, RMS and a 1.5 s peak hold, per track and "master". */
  meters(): Meter[] {
    const out: Meter[] = [];
    const now = performance.now();
    const read = (id: string, b: Bus) => {
      b.analyser.getFloatTimeDomainData(b.buf as any);
      let peak = 0, sum = 0;
      for (const x of b.buf) { const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
      const p = dB(peak);
      if (p >= b.peakHold || now - b.peakAt > 1500) { b.peakHold = p; b.peakAt = now; }
      out.push({ id, peak: p, rms: dB(Math.sqrt(sum / b.buf.length)), hold: b.peakHold });
    };
    if (this.master) read("master", this.master);
    for (const [id, b] of this.buses) read(id, b);
    return out;
  }

  /** For tests and troubleshooting. */
  debug() {
    return {
      ctx: this.ctx?.state ?? "none", rate: this.transport.rate, time: Math.round(this.transport.time * 1000) / 1000,
      voices: [...this.voices.entries()].map(([id, v]) => ({ id, src: v.src, ready: v.el.readyState, paused: v.el.paused, t: Math.round(v.el.currentTime * 100) / 100, gain: Math.round(v.gain.gain.value * 100) / 100, err: v.el.error?.code })),
      buses: [...this.buses.entries()].map(([id, b]) => ({ id, gain: Math.round(b.gain.gain.value * 100) / 100 })),
    };
  }

  dispose() {
    this.unsub?.();
    for (const id of [...this.voices.keys()]) this.dropVoice(id);
    this.ctx?.close();
  }
}
