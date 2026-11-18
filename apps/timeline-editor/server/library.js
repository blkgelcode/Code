// The media library's live state: for every media entry, whether its file is
// online, and how far its thumbnail, waveform and proxy have got. This lives in
// memory and is sent to the browser; timeline.json only holds the paths.
//
// - Jobs run in one queue, at most 2 at a time: thumbnail, waveform, then proxy.
// - Finished cache files are found on disk, so nothing is processed twice.
// - Every few seconds (and whenever /Volumes changes) each file is checked. A
//   missing file goes "offline" and its queued jobs are dropped; when it comes
//   back, at the same path or the same path on a drive that remounted under a new
//   name ("T7" -> "T7 1"), it goes online again and its jobs resume.
import fs from "node:fs";
import path from "node:path";
import { JobQueue } from "./queue.js";
import { detectHardware } from "./hw.js";
import {
  resolvePath, cacheKey, cachePaths, needs, makeThumb, makeWave, makeProxy, cleanPartials,
} from "./media.js";

const PRIORITY = { thumb: 0, wave: 1, proxy: 2 };
export const VOLUMES_DIR = process.env.VOLUMES_DIR || "/Volumes";

export class MediaLibrary {
  constructor(store, { broadcast }) {
    this.store = store;
    this.broadcast = broadcast;
    this.status = {}; // mediaId -> status
    this.keys = {}; // mediaId -> cache key
    this.hw = null;
    this.timer = null;
    this.pending = null;
    this.queue = new JobQueue({ concurrency: Number(process.env.TIMELINE_JOBS || 2), onChange: (e) => this.onJob(e) });
  }

  async start() {
    cleanPartials();
    this.hw = await detectHardware();
    console.log(`  encoder:  ${this.hw.encoder}${this.hw.decode ? ` · decode: ${this.hw.decode}` : ""}`);
    await this.sync();
    this.timer = setInterval(() => this.sync().catch((e) => console.error("media check:", e.message)), 3000);
    try {
      fs.watch(VOLUMES_DIR, () => setTimeout(() => this.sync().catch(() => {}), 500));
    } catch {
      // no /Volumes (not a Mac): the interval check still catches changes
    }
  }

  /** Status for the browser: { mediaId: {...} } */
  snapshot() {
    return this.status;
  }

  changed(id) {
    // send updates at most ~5 times a second
    this.pending ??= new Set();
    this.pending.add(id);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      const ids = [...this.pending];
      this.pending = null;
      this.flushTimer = null;
      const update = {};
      for (const i of ids) update[i] = this.status[i] ?? null;
      this.broadcast({ type: "media", update });
    }, 200);
  }

  /** Check every media file and queue whatever is missing. Safe to call any time. */
  async sync() {
    const tl = this.store.timeline;
    if (!tl || this.syncing) return;
    this.syncing = true;
    try {
      await this.syncNow(tl);
    } finally {
      this.syncing = false;
    }
  }

  async syncNow(tl) {
    const ids = new Set(tl.media.map((m) => m.id));
    for (const id of Object.keys(this.status)) {
      if (!ids.has(id)) {
        delete this.status[id];
        this.queue.cancel((j) => j.meta.mediaId === id);
        this.changed(id);
      }
    }
    for (const m of tl.media) await this.check(m);
  }

  async check(m) {
    const abs = resolvePath(m);
    const prev = this.status[m.id];
    let st = null;
    try {
      st = await fs.promises.stat(abs);
    } catch {
      st = null;
    }
    if (!st) {
      const moved = this.findOnOtherVolume(abs, m);
      if (moved) return this.relink(m, moved);
      if (!prev || prev.online !== false) {
        this.status[m.id] = { ...(prev || {}), online: false, path: abs };
        this.queue.cancel((j) => j.meta.mediaId === m.id);
        this.changed(m.id);
      }
      return;
    }
    const key = cacheKey(abs, st);
    const kind = m.kind;
    const files = cachePaths(key, kind, m.logProfile);
    const need = needs(m, abs);
    // the browser's cache-buster: changes when the file or its color input changes
    const vkey = m.logProfile === "dlogm" ? `${key}-dlogm` : key;
    const s = prev && prev.key === vkey ? { ...prev, jobs: { ...prev.jobs } } : { jobs: {}, key: vkey };
    s.online = true;
    s.path = abs;
    for (const job of ["thumb", "wave", "proxy"]) {
      if (!need[job]) {
        s.jobs[job] = "none";
        continue;
      }
      if (fs.existsSync(files[job])) s.jobs[job] = "done";
      else if (s.jobs[job] !== "error" && s.jobs[job] !== "running") {
        s.jobs[job] = "queued";
        this.queueJob(m, job, abs, files[job]);
      }
    }
    s.ready = !need.proxy || s.jobs.proxy === "done";
    if (m.kind === "image") s.ready = true;
    this.keys[m.id] = key;
    if (JSON.stringify(s) !== JSON.stringify(prev)) {
      this.status[m.id] = s;
      this.changed(m.id);
    }
  }

  queueJob(m, job, abs, out) {
    const key = `${m.id}:${job}:${out}`;
    this.queue.add(key, PRIORITY[job], (progress) => {
      if (!fs.existsSync(abs)) throw new Error("the file went offline");
      if (job === "thumb") return makeThumb(m, abs, out);
      if (job === "wave") return makeWave(m, abs, out, progress);
      return makeProxy(m, abs, out, this.hw, progress);
    }, { mediaId: m.id, job });
  }

  onJob({ type, meta, progress, error }) {
    const s = this.status[meta.mediaId];
    if (!s) return;
    if (type === "start") s.jobs[meta.job] = "running";
    if (type === "progress") s.progress = { ...(s.progress || {}), [meta.job]: progress };
    if (type === "done") {
      s.jobs[meta.job] = "done";
      if (s.progress) delete s.progress[meta.job];
      if (meta.job === "proxy") s.ready = true;
    }
    if (type === "error") {
      s.jobs[meta.job] = "error";
      s.errors = { ...(s.errors || {}), [meta.job]: error };
      // a file that vanished mid-job is offline, not broken: the next check requeues it
      if (!fs.existsSync(s.path)) {
        s.online = false;
        s.jobs[meta.job] = "queued";
        delete s.errors[meta.job];
      }
    }
    this.changed(meta.mediaId);
  }

  /** Clear a clip's errors and try its jobs again. */
  retry(id) {
    const s = this.status[id];
    if (!s) return;
    for (const [job, state] of Object.entries(s.jobs || {})) if (state === "error") delete s.jobs[job];
    s.errors = {};
    const m = this.store.timeline?.media.find((x) => x.id === id);
    if (m) this.check(m);
  }

  /** /Volumes/T7/a/b.mp4 offline? Look for /Volumes/<any>/a/b.mp4 with the same size. */
  findOnOtherVolume(abs, m) {
    const rel = path.relative(VOLUMES_DIR, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const [, ...rest] = rel.split(path.sep);
    if (!rest.length) return null;
    let vols;
    try {
      vols = fs.readdirSync(VOLUMES_DIR);
    } catch {
      return null;
    }
    for (const v of vols) {
      const candidate = path.join(VOLUMES_DIR, v, ...rest);
      if (candidate === abs) continue;
      try {
        const st = fs.statSync(candidate);
        if (st.isFile() && (!m.size || st.size === m.size)) return candidate;
      } catch {
        // not on this volume
      }
    }
    return null;
  }

  relink(m, newPath) {
    const tl = JSON.parse(JSON.stringify(this.store.timeline));
    const entry = tl.media.find((x) => x.id === m.id);
    if (!entry) return;
    entry.file = newPath;
    this.store.write(tl, "app");
    setTimeout(() => this.sync().catch(() => {}), 50);
  }

  /** Paths of offline media used by clips (export can't run without them). */
  offlineInUse() {
    const tl = this.store.timeline;
    const used = new Set(tl.sequences.flatMap((s) => s.tracks).flatMap((t) => t.clips.map((c) => c.media)).filter(Boolean));
    return tl.media.filter((m) => used.has(m.id) && this.status[m.id]?.online === false);
  }

  /** Cache file for a media id, if it's done. */
  cached(id, job) {
    const m = this.store.timeline?.media.find((x) => x.id === id);
    const key = this.keys[id];
    if (!m || !key) return null;
    const p = cachePaths(key, m.kind, m.logProfile)[job];
    return fs.existsSync(p) ? p : null;
  }
}
