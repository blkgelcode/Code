// Owns project/timeline.json on disk: loading, atomic writes, telling our own
// writes apart from outside edits (Claude Code), and the activity log.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { defaultTimeline, normalize, diffTimelines } from "../src/lib/model.js";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PROJECT_DIR = path.resolve(process.env.PROJECT_DIR || path.join(APP_DIR, "project"));
export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(APP_DIR, "media"));
export const TIMELINE_FILE = path.join(PROJECT_DIR, "timeline.json");
export const ACTIVITY_FILE = path.join(PROJECT_DIR, "activity.jsonl");
export const CACHE_DIR = path.join(PROJECT_DIR, ".cache");
export const EXPORT_DIR = path.join(PROJECT_DIR, "exports");
export const DIST_DIR = path.join(APP_DIR, "dist");

const hash = (text) => crypto.createHash("sha1").update(text).digest("hex");
export const serialize = (tl) => JSON.stringify(tl, null, 2) + "\n";

export function ensureProject() {
  for (const d of [PROJECT_DIR, MEDIA_DIR, CACHE_DIR, EXPORT_DIR]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(TIMELINE_FILE)) fs.writeFileSync(TIMELINE_FILE, serialize(defaultTimeline()));
}

/** Read and validate timeline.json. Returns { timeline, raw, errors, warnings }. */
export function readTimelineFile() {
  const text = fs.readFileSync(TIMELINE_FILE, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { timeline: null, raw: null, text, errors: [`timeline.json is not valid JSON: ${e.message}`], warnings: [] };
  }
  const { timeline, errors, warnings } = normalize(parsed);
  return { timeline, raw: parsed, text, errors, warnings };
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
 * In-memory state of the project. `rev` increases on every accepted change, from
 * either side, and is how the browser detects that its copy is out of date.
 */
export class TimelineStore {
  constructor() {
    ensureProject();
    const r = readTimelineFile();
    this.timeline = r.timeline;
    this.errors = r.errors;
    this.warnings = r.warnings;
    this.rev = 1;
    this.lastWrittenHash = null;
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  record(author, prev, next) {
    const changes = diffTimelines(prev, next);
    if (!changes.length) return null;
    const entry = { ts: new Date().toISOString(), rev: this.rev, author, changes };
    appendActivity(entry);
    return entry;
  }

  /**
   * Apply a change from the app (the browser, import, export): validate, write the
   * file atomically and remember its hash so the watcher knows it was us.
   */
  write(next, author = "user", baseRev = null) {
    if (baseRev !== null && baseRev !== this.rev) {
      return { ok: false, conflict: true, error: "The timeline changed while you were editing. Your view has been refreshed." };
    }
    const { timeline, errors, warnings } = normalize(next);
    if (!timeline) return { ok: false, errors };
    const text = serialize(timeline);
    const tmp = `${TIMELINE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, TIMELINE_FILE);
    this.lastWrittenHash = hash(text);
    const prev = this.timeline;
    this.timeline = timeline;
    this.errors = [];
    this.warnings = warnings;
    this.rev += 1;
    const entry = this.record(author, prev, timeline);
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
      appendActivity({ ts: new Date().toISOString(), rev: this.rev, author: "claude", invalid: true, changes: r.errors.map((text) => ({ text, clipIds: [] })) });
      return;
    }
    const prev = this.timeline;
    this.timeline = r.timeline;
    this.errors = [];
    this.warnings = r.warnings;
    this.rev += 1;
    const entry = this.record("claude", prev, r.timeline);
    this.emit({ type: "timeline", author: "claude", entry });
  }
}
