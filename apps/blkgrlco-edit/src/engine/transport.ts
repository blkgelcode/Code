// Playback clock for a monitor. Lives outside React: the viewer and the timeline playhead
// follow it every frame without re-rendering the app; the timecode display subscribes too.
//
// J/K/L shuttle (Premiere/FCP/Resolve):
//   L plays forward; each extra L doubles the speed (1× → 2× → 4× → 8×). J the same in reverse.
//   K stops. Holding K and tapping J/L steps one frame; holding K and holding L/J plays at ¼ speed.
export class Transport {
  time = 0;
  rate = 0;            // 0 = paused; negative = reverse
  duration = 0;
  fps = 30;
  private raf = 0;
  private last = 0;
  private subs = new Set<(t: Transport) => void>();
  kHeld = false;

  constructor(readonly name: string) {}

  subscribe(fn: (t: Transport) => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { for (const s of this.subs) s(this); }

  get playing() { return this.rate !== 0; }

  /** Snap a time to this monitor's frame grid (the frame that's on screen). */
  frameTime(t = this.time) { return Math.floor(t * this.fps + 1e-6) / this.fps; }

  setDuration(d: number, fps: number) {
    this.duration = Math.max(0, d);
    this.fps = fps || 30;
    if (this.time > this.duration) this.seek(this.duration);
  }

  seek(t: number) {
    this.time = Math.min(Math.max(0, t), this.duration);
    this.emit();
  }

  step(frames: number) { this.pause(); this.seek(this.frameTime() + frames / this.fps + 1e-6); }

  play(rate = 1) {
    if (rate > 0 && this.time >= this.duration - 1e-3) this.time = 0;          // play from the start again
    if (rate < 0 && this.time <= 1e-3) this.time = this.duration;
    this.rate = rate;
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    this.emit();
  }

  pause() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.rate = 0;
    this.time = this.frameTime(); // land exactly on a frame
    this.emit();
  }

  toggle() { if (this.playing) this.pause(); else this.play(1); }

  /** L (dir 1) / J (dir −1). */
  shuttle(dir: 1 | -1) {
    if (this.kHeld) { this.step(dir); return; }
    const r = this.rate;
    if (Math.sign(r) !== dir || r === 0) this.play(dir);
    else this.play(Math.max(-8, Math.min(8, r * 2)));
  }

  private tick = (now: number) => {
    // rAF timestamps are the START of the frame, which can be a hair earlier than the moment
    // play() ran: never step backwards (a negative step at 0:00 used to stop playback at once)
    const dt = Math.max(0, Math.min(0.25, (now - this.last) / 1000));
    this.last = now;
    let t = this.time + dt * this.rate;
    // stop at the end you're travelling towards (and only that one)
    if (this.rate > 0 && t >= this.duration) { this.time = this.duration; this.pause(); return; }
    if (this.rate < 0 && t <= 0) { this.time = 0; this.pause(); return; }
    this.time = t;
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose() { if (this.raf) cancelAnimationFrame(this.raf); this.subs.clear(); }
}
