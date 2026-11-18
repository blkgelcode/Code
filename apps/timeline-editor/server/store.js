// Owns project/timeline.json on disk: loading (with v1 -> v2 migration), atomic
// writes, telling our own writes apart from outside edits (Claude Code), the
// readable activity log, and undo/redo through History.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { defaultTimeline, normalize, diffTimelines } from "../src/lib/model.js";
import { diff } from "../src/lib/patch.js";
import { History } from "./history.js";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = path.resolve(APP_DIR, "..", "..");

export const PROJECT_DIR = path.resolve(process.env.PROJECT_DIR || path.join(APP_DIR, "project"));
export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(APP_DIR, "media"));
export const TIMELINE_FILE = path.join(PROJECT_DIR, "timeline.json");
export const ACTIVITY_FILE = path.join(PROJECT_DIR, "activity.jsonl");
export const CACHE_DIR = path.join(PROJECT_DIR, ".cache");
export const EXPORT_DIR = path.join(PROJECT_DIR, "exports");
export const DIST_DIR = path.join(APP_DIR, "dist");
export const LOCK_FILE = path.join(PROJECT_DIR, ".history", "server.json");

const hash = (text) => crypto.createHash("sha1").update(text).digest("hex");
export const serialize = (tl) => JSON.stringify(tl, null, 2) + "\n";

export function ensureProject() {
  for (const d of [PROJECT_DIR, MEDIA_DIR, CACHE_DIR, EXPORT_DIR]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(TIMELINE_FILE)) fs.writeFileSync(TIMELINE_FILE, serialize(defaultTimeline()));
}

/** Read and validate timeline.json. Returns { timeline, raw, errors, warnings, migrated }. */
export function readTimelineFile() {
  const text = fs.readFileSync(TIMELINE_FILE, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { timeline: null, raw: null, text, errors: [`timeline.json is not valid JSON: ${e.message}`], warnings: [] };
  }
  return { ...normalize(parsed), raw: parsed, text };
}

export function appendActivity(entry) {
  fs.appendFileSync(ACTIVITY_FILE, JSON.stringify(entry) + "\n");
}

export function readActivity(limit = 200) {
  if (!fs.existsSync(ACTIVITY_FILE)) return [];
  const lines = fs.readFileSync(ACTIVITY_FILE, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * The project in memory. `rev` (persistent, from History) increases on every
 * accepted change from either side, including undo/redo, and is how a browser
 * detects that its copy is out of date.
 */
export class TimelineStore {
  constructor() {
    ensureProject();
    this.history = new History(PROJECT_DIR);
    this.listeners = new Set();
    this.lastWrittenHash = null;
    const r = readTimelineFile();
    this.timeline = r.timeline;
    this.errors = r.errors;
    this.warnings = r.warnings || [];
    if (!r.timeline) return;
    if (r.migrated) {
      // keep the v1 file as a version, then upgrade in place
      this.history.saveVersion("Before upgrade to v2", r.raw, "app");
      this.writeFile(r.timeline);
      this.history.saveHead(r.timeline);
      appendActivity({ ts: new Date().toISOString(), author: "app", changes: [{ text: "Upgraded the project to schema v2 (the v1 file is saved under Versions)", clipIds: [] }] });
      return;
    }
    const head = this.history.readHead();
    if (!head) this.history.saveHead(r.timeline);
    else if (diff(head, r.timeline).length) {
      // the file was edited while the app was closed (e.g. by Claude)
      this.recordChange("claude", head, r.timeline, [{ text: "Changes made while the app was closed:", clipIds: [] }]);
    }
  }

  get rev() {
    return this.history.rev;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  writeFile(tl) {
    const text = serialize(tl);
    const tmp = `${TIMELINE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, TIMELINE_FILE);
    this.lastWrittenHash = hash(text);
  }

  /** History entry + activity line for a change. Returns the activity entry (or null). */
  recordChange(author, prev, next, prefix = [], extra = {}) {
    const changes = [...prefix, ...diffTimelines(prev, next)];
    const h = this.history.record(author, prev, next, changes, extra);
    if (!h) return null;
    const entry = { ts: h.ts, rev: this.rev, seq: h.seq, author, changes };
    appendActivity(entry);
    return entry;
  }

  setTimeline(tl, warnings = []) {
    this.timeline = tl;
    this.errors = [];
    this.warnings = warnings;
  }

  /**
   * A change from the app (browser, import, relink, CLI without a server): validate,
   * write atomically, record it. baseRev guards against overwriting a newer change.
   */
  write(next, author = "user", baseRev = null, { prefix = [] } = {}) {
    if (baseRev !== null && baseRev !== this.rev) {
      return { ok: false, conflict: true, error: "The timeline changed while you were editing. Your view has been refreshed." };
    }
    const { timeline, errors, warnings } = normalize(next);
    if (!timeline) return { ok: false, errors };
    const prev = this.timeline;
    this.writeFile(timeline);
    this.setTimeline(timeline, warnings);
    const entry = prev ? this.recordChange(author, prev, timeline, prefix) : null;
    if (!prev) this.history.saveHead(timeline);
    this.emit({ type: "timeline", author, entry });
    return { ok: true, rev: this.rev, warnings };
  }

  /** Called by the file watcher. Anything we didn't write ourselves is an outside edit. */
  fileChanged() {
    let text;
    try {
      text = fs.readFileSync(TIMELINE_FILE, "utf8");
    } catch {
      return; // mid-rename; the next event will have the file
    }
    if (hash(text) === this.lastWrittenHash) return;
    this.lastWrittenHash = hash(text);
    const r = readTimelineFile();
    if (!r.timeline) {
      this.errors = r.errors;
      this.emit({ type: "invalid", errors: r.errors });
      appendActivity({ ts: new Date().toISOString(), rev: this.rev, author: "claude", invalid: true, changes: r.errors.map((t) => ({ text: t, clipIds: [] })) });
      return;
    }
    const prev = this.timeline || this.history.readHead();
    if (r.migrated) this.writeFile(r.timeline);
    this.setTimeline(r.timeline, r.warnings);
    const entry = prev ? this.recordChange("claude", prev, r.timeline) : null;
    this.emit({ type: "timeline", author: "claude", entry });
  }

  // ---- undo / redo ----------------------------------------------------------------------------

  requireValid() {
    if (!this.timeline || this.errors.length) throw new Error("timeline.json has errors: fix it or restore the last good version first.");
  }

  /** Write a timeline produced by undo/redo (already a previous valid state). */
  applyMove(timeline, author, text, undoOf) {
    const { timeline: t, errors } = normalize(timeline);
    if (!t) throw new Error(`That would leave the timeline invalid: ${errors[0]}`);
    this.writeFile(t);
    this.setTimeline(t);
    const entry = { ts: new Date().toISOString(), rev: this.rev, author, undo: undoOf, changes: [{ text, clipIds: [] }] };
    appendActivity(entry);
    this.emit({ type: "timeline", author, entry });
    return entry;
  }

  undo(author = "user") {
    this.requireValid();
    const { timeline, entry } = this.history.undo(this.timeline);
    return this.applyMove(timeline, author, `Undid #${entry.seq} (${who(entry.author)}): ${shortText(entry)}`, entry.seq);
  }

  redo(author = "user") {
    this.requireValid();
    const { timeline, entry } = this.history.redo(this.timeline);
    return this.applyMove(timeline, author, `Redid #${entry.seq}: ${shortText(entry)}`, entry.seq);
  }

  /** Undo one specific earlier change (selective undo). */
  undoEntry(seq, author = "user") {
    this.requireValid();
    const r = this.history.undoEntry(seq, this.timeline);
    if (r.latest) return this.applyMove(r.timeline, author, `Undid #${r.entry.seq} (${who(r.entry.author)}): ${shortText(r.entry)}`, r.entry.seq);
    const res = this.write(r.timeline, author, null, { prefix: [{ text: `Undid #${seq} (${who(r.entry.author)}) on its own:`, clipIds: [] }] });
    if (!res.ok) throw new Error((res.errors || [res.error]).join("; "));
    return res;
  }

  // ---- versions and recovery -----------------------------------------------------------------

  saveVersion(name, author = "user") {
    this.requireValid();
    const file = this.history.saveVersion(name, this.timeline, author);
    appendActivity({ ts: new Date().toISOString(), rev: this.rev, author, changes: [{ text: `Saved version "${name}"`, clipIds: [] }] });
    return file;
  }

  /** Restore a named version or autosave snapshot, as a normal (undoable) change. */
  restoreVersion(id, author = "user") {
    const v = this.history.readVersion(id);
    const res = this.write(v.timeline, author, null, { prefix: [{ text: `Restored "${v.name}":`, clipIds: [] }] });
    if (!res.ok) throw new Error((res.errors || [res.error]).join("; "));
    return res;
  }

  /** timeline.json is broken: put back the last good copy. */
  recover(author = "user") {
    const head = this.history.readHead();
    if (!head) throw new Error("There's no earlier good copy to restore.");
    const { timeline, errors } = normalize(head);
    if (!timeline) throw new Error(`The saved copy is invalid too: ${errors[0]}`);
    const broken = this.errors;
    this.writeFile(timeline);
    this.setTimeline(timeline);
    const entry = { ts: new Date().toISOString(), rev: this.rev, author, changes: [{ text: `Restored the last good version (timeline.json was broken: ${broken[0] || "unreadable"})`, clipIds: [] }] };
    appendActivity(entry);
    this.emit({ type: "timeline", author, entry });
    return entry;
  }
}

const who = (a) => (a === "user" ? "you" : a === "claude" ? "Claude" : a);
const shortText = (e) => {
  const t = (e.changes || []).map((c) => c.text).join("; ");
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
};
