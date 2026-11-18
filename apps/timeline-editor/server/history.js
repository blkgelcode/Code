// Undo/redo, autosave snapshots, named versions and the last-good copy, all in
// project/.history (and project/versions). Shared by the server and the `tl` CLI.
//
// Every accepted change, from the browser, the CLI or a raw edit of the file, is
// stored as a forward and an inverse JSON patch with its author. Undo applies the
// inverse of the latest applied change, whoever made it; redo re-applies it. An
// earlier change can be undone on its own when nothing after it touched the same
// parts of the timeline. The log survives restarts.
import fs from "node:fs";
import path from "node:path";
import { diff, apply, overlaps } from "../src/lib/patch.js";

const MAX_ENTRIES = 1000;
const SNAPSHOT_EVERY = 50;
const SNAPSHOT_MS = 5 * 60 * 1000;
const KEEP_SNAPSHOTS = 50;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "version";
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export class History {
  constructor(projectDir) {
    this.dir = path.join(projectDir, ".history");
    this.snapDir = path.join(this.dir, "snapshots");
    this.versionDir = path.join(projectDir, "versions");
    for (const d of [this.dir, this.snapDir, this.versionDir]) fs.mkdirSync(d, { recursive: true });
    this.logFile = path.join(this.dir, "log.jsonl");
    this.stateFile = path.join(this.dir, "state.json");
    this.headFile = path.join(this.dir, "head.json");
    this.entries = [];
    if (fs.existsSync(this.logFile)) {
      for (const line of fs.readFileSync(this.logFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.entries.push(JSON.parse(line));
        } catch {
          // a half-written last line after a crash: skip it
        }
      }
    }
    let state = {};
    try {
      state = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
    } catch {
      // first run
    }
    this.rev = state.rev || 0;
    this.cursor = Math.min(state.cursor ?? this.entries.length, this.entries.length);
    this.lastSnapshot = state.lastSnapshot || 0;
    this.sinceSnapshot = state.sinceSnapshot || 0;
  }

  saveState() {
    writeAtomic(this.stateFile, JSON.stringify({ rev: this.rev, cursor: this.cursor, lastSnapshot: this.lastSnapshot, sinceSnapshot: this.sinceSnapshot }));
  }

  rewriteLog() {
    writeAtomic(this.logFile, this.entries.map((e) => JSON.stringify(e)).join("\n") + (this.entries.length ? "\n" : ""));
  }

  nextSeq() {
    return (this.entries.at(-1)?.seq || 0) + 1;
  }

  /** The last valid timeline written: the crash-recovery copy. */
  readHead() {
    try {
      return JSON.parse(fs.readFileSync(this.headFile, "utf8"));
    } catch {
      return null;
    }
  }

  saveHead(tl) {
    writeAtomic(this.headFile, JSON.stringify(tl));
  }

  /** Record a change. Returns the entry, or null if nothing changed. */
  record(author, prev, next, changes, extra = {}) {
    const forward = diff(prev, next);
    if (!forward.length) return null;
    if (this.cursor < this.entries.length) {
      // a new change after undo: the undone changes can't be redone any more
      this.entries = this.entries.slice(0, this.cursor);
      this.rewriteLog();
    }
    const entry = { seq: this.nextSeq(), ts: new Date().toISOString(), author, changes, forward, inverse: diff(next, prev), ...extra };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
      this.rewriteLog();
    } else {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
    }
    this.cursor = this.entries.length;
    this.rev += 1;
    this.sinceSnapshot += 1;
    this.saveHead(next);
    this.maybeSnapshot(next);
    this.saveState();
    return entry;
  }

  /** A move that isn't a new entry (undo/redo): bump the revision, keep the head. */
  moved(next) {
    this.rev += 1;
    this.sinceSnapshot += 1;
    this.saveHead(next);
    this.maybeSnapshot(next);
    this.saveState();
  }

  summary(e) {
    if (!e) return null;
    return { seq: e.seq, author: e.author, text: e.changes?.map((c) => c.text).join("; ") || "change" };
  }

  status() {
    return {
      rev: this.rev,
      canUndo: this.summary(this.entries[this.cursor - 1]),
      canRedo: this.summary(this.entries[this.cursor]),
      applied: this.entries.slice(0, this.cursor).map((e) => e.seq),
      undone: this.entries.slice(this.cursor).map((e) => e.seq),
    };
  }

  /** Undo the latest applied change. Returns { timeline, entry } or throws. */
  undo(current) {
    const entry = this.entries[this.cursor - 1];
    if (!entry) throw new Error("Nothing to undo.");
    const timeline = apply(current, entry.inverse);
    this.cursor -= 1;
    this.moved(timeline);
    return { timeline, entry };
  }

  redo(current) {
    const entry = this.entries[this.cursor];
    if (!entry) throw new Error("Nothing to redo.");
    const timeline = apply(current, entry.forward);
    this.cursor += 1;
    this.moved(timeline);
    return { timeline, entry };
  }

  /**
   * Undo one earlier change on its own. Allowed when no change after it touched the
   * same parts of the timeline. Returns { timeline, entry, latest } — `latest` true
   * means it was simply the newest change (a normal undo).
   */
  undoEntry(seq, current) {
    const i = this.entries.findIndex((e) => e.seq === seq);
    if (i < 0 || i >= this.cursor) throw new Error(`Change #${seq} isn't in the undo history any more.`);
    if (i === this.cursor - 1) return { ...this.undo(current), latest: true };
    const entry = this.entries[i];
    const later = this.entries.slice(i + 1, this.cursor).filter((e) => overlaps(e.forward, entry.forward));
    if (later.length) {
      const who = later.map((e) => `#${e.seq} (${e.author === "user" ? "you" : e.author})`).join(", ");
      throw new Error(`Can't undo #${seq} on its own: later change${later.length > 1 ? "s" : ""} ${who} touched the same clips. Undo ${later.length > 1 ? "those" : "that"} first.`);
    }
    return { timeline: apply(current, entry.inverse), entry, latest: false };
  }

  // ---- snapshots and versions ---------------------------------------------------------------

  maybeSnapshot(tl, force = false) {
    const due = force || this.sinceSnapshot >= SNAPSHOT_EVERY || Date.now() - this.lastSnapshot >= SNAPSHOT_MS;
    if (!due) return null;
    const file = path.join(this.snapDir, `${stamp()}.json`);
    writeAtomic(file, JSON.stringify(tl));
    this.lastSnapshot = Date.now();
    this.sinceSnapshot = 0;
    this.pruneSnapshots();
    return file;
  }

  /** Keep the newest 50, plus the oldest snapshot of every earlier day. */
  pruneSnapshots() {
    const files = fs.readdirSync(this.snapDir).filter((f) => f.endsWith(".json")).sort();
    const keep = new Set(files.slice(-KEEP_SNAPSHOTS));
    const days = new Set();
    for (const f of files) {
      const day = f.slice(0, 10);
      if (!days.has(day)) {
        days.add(day);
        keep.add(f);
      }
    }
    for (const f of files) if (!keep.has(f)) fs.rmSync(path.join(this.snapDir, f), { force: true });
  }

  saveVersion(name, tl, author) {
    const file = `${stamp()}-${slug(name)}.json`;
    writeAtomic(path.join(this.versionDir, file), JSON.stringify({ name, ts: new Date().toISOString(), author, timeline: tl }, null, 2));
    return file;
  }

  /** Named versions and automatic snapshots, newest first. */
  listVersions() {
    const versions = fs.readdirSync(this.versionDir).filter((f) => f.endsWith(".json")).map((file) => {
      try {
        const v = JSON.parse(fs.readFileSync(path.join(this.versionDir, file), "utf8"));
        return { id: `version:${file}`, name: v.name, ts: v.ts, author: v.author, kind: "version" };
      } catch {
        return null;
      }
    }).filter(Boolean);
    const snaps = fs.readdirSync(this.snapDir).filter((f) => f.endsWith(".json")).map((file) => ({
      id: `snapshot:${file}`,
      name: "Autosave",
      ts: file.slice(0, 19).replace(/T(\d\d)-(\d\d)-(\d\d)/, "T$1:$2:$3") + "Z",
      kind: "snapshot",
    }));
    return [...versions, ...snaps].sort((a, b) => b.ts.localeCompare(a.ts));
  }

  readVersion(id) {
    const [kind, file] = String(id).split(":");
    if (!file || file.includes("/") || file.includes("..")) throw new Error("bad version id");
    if (kind === "version") {
      const v = JSON.parse(fs.readFileSync(path.join(this.versionDir, file), "utf8"));
      return { name: v.name, timeline: v.timeline };
    }
    if (kind === "snapshot") return { name: `autosave ${file.slice(0, 16)}`, timeline: JSON.parse(fs.readFileSync(path.join(this.snapDir, file), "utf8")) };
    throw new Error("bad version id");
  }
}
