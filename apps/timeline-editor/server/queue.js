// A small job queue: at most `concurrency` jobs run at once, lower priority
// numbers go first, and the same key is never queued twice. A failing job only
// marks itself failed; it never throws out of the queue.
export class JobQueue {
  constructor({ concurrency = 2, onChange = () => {} } = {}) {
    this.concurrency = concurrency;
    this.onChange = onChange;
    this.waiting = []; // { key, priority, seq, run, meta }
    this.running = new Map(); // key -> job
    this.seq = 0;
  }

  has(key) {
    return this.running.has(key) || this.waiting.some((j) => j.key === key);
  }

  /** run(progress) returns a promise; progress(fraction) reports 0..1. */
  add(key, priority, run, meta = {}) {
    if (this.has(key)) return false;
    this.waiting.push({ key, priority, seq: this.seq++, run, meta });
    this.waiting.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    this.onChange({ type: "queued", key, meta });
    this.pump();
    return true;
  }

  /** Drop waiting jobs that match (running jobs finish on their own). */
  cancel(match) {
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((j) => !match(j));
    return before - this.waiting.length;
  }

  get size() {
    return this.waiting.length + this.running.size;
  }

  pump() {
    while (this.running.size < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      this.running.set(job.key, job);
      this.onChange({ type: "start", key: job.key, meta: job.meta });
      const progress = (p) => this.onChange({ type: "progress", key: job.key, meta: job.meta, progress: p });
      Promise.resolve()
        .then(() => job.run(progress))
        .then(
          (result) => this.onChange({ type: "done", key: job.key, meta: job.meta, result }),
          (error) => this.onChange({ type: "error", key: job.key, meta: job.meta, error: String(error?.message || error) }),
        )
        .finally(() => {
          this.running.delete(job.key);
          this.pump();
        });
    }
  }
}
