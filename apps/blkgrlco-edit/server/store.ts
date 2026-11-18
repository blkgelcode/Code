// The timeline store: owns timeline.json, the history log, undo/redo, and crash recovery.
//
// Files in the project folder:
//   timeline.json            the edit (canonical JSON; the only file anyone edits)
//   .history/log.jsonl       every change, in order: author, ops (with what they replaced), hash
//   .history/snap-<rev>.json full snapshots (rev 0, then every 50 changes)
//   activity.jsonl           human-readable summary of each change (for `tail`)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validate, normalize, migrate, canonicalText, emptyTimeline, type Timeline } from "../shared/model";
import { applyOps, invertAll, diff, describe, OpError, type Op, type Change } from "../shared/ops";
import { precondition } from "../shared/precondition";

export type Author = "you" | "claude" | "app";
export type EntryKind = "init" | "edit" | "undo" | "redo" | "revert" | "restore" | "recover";

export interface Entry {
  rev: number;
  at: string;
  author: Author;
  kind: EntryKind;
  ops: Op[];
  changes: Change[];
  ref?: number;      // undo/redo/revert/restore: the revision it acts on
  note?: string;
  hash: string;      // sha1 of timeline.json after this change
}

export class Conflict extends Error {
  constructor(message: string, public reason?: string) { super(message); }
}

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const SNAP_EVERY = 50;
const UNDOABLE: EntryKind[] = ["edit", "redo", "revert", "restore"];
/** Only switched the active sequence: a view change, which ⌘Z skips (like every NLE). */
const viewOnly = (e: Entry) => e.ops.length > 0 && e.ops.every((o) => o.t === "set" && o.target.kind === "timeline" && o.key === "activeSequence");

export function atomicWrite(file: string, text: string) {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  try { const d = fs.openSync(path.dirname(file), "r"); fs.fsyncSync(d); fs.closeSync(d); } catch { /* not all filesystems allow it */ }
}

function appendLine(file: string, line: string) {
  const fd = fs.openSync(file, "a");
  try { fs.writeSync(fd, line + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export class Store {
  readonly file: string;
  readonly histDir: string;
  readonly logFile: string;
  readonly activityFile: string;
  tl!: Timeline;
  warnings: string[] = [];
  fileError: string | null = null;
  bootNotes: string[] = [];
  entries: Entry[] = [];
  private undone = new Set<number>();               // revs currently undone
  private redo = new Map<Author, number[]>();       // per author: undo-entry revs that can be redone
  private lastWrittenHash: string | null = null;

  constructor(readonly projectDir: string) {
    this.file = path.join(projectDir, "timeline.json");
    this.histDir = path.join(projectDir, ".history");
    this.logFile = path.join(this.histDir, "log.jsonl");
    this.activityFile = path.join(projectDir, "activity.jsonl");
    fs.mkdirSync(this.histDir, { recursive: true });
  }

  get rev() { return this.entries.length ? this.entries[this.entries.length - 1].rev : 0; }
  get text() { return canonicalText(this.tl); }

  // ------------------------------------------------------------- boot + recovery
  boot() {
    this.loadLog();
    const fileText = fs.existsSync(this.file) ? fs.readFileSync(this.file, "utf8") : null;
    const parsed = fileText === null ? { ok: false as const, reason: "missing" } : this.parseText(fileText);

    if (!this.entries.length) {
      // First run with history: start it from whatever is on disk (or an empty timeline).
      let tl: Timeline;
      if (parsed.ok) tl = parsed.tl;
      else if (fileText === null) tl = emptyTimeline(path.basename(this.projectDir));
      else {
        this.fileError = `timeline.json can't be used and there's no history to restore from:\n${parsed.reason}`;
        this.tl = emptyTimeline(path.basename(this.projectDir));
        return; // don't overwrite her file; she (or Claude) fixes it, the watcher picks it up
      }
      if (parsed.ok && parsed.migrated) this.bootNotes.push("Upgraded timeline.json from v1 to v2 (a copy of the old file is in .history/).");
      if (parsed.ok && parsed.migrated) fs.copyFileSync(this.file, path.join(this.histDir, `timeline.v1-${Date.now()}.json`));
      this.tl = tl;
      this.push({ author: "app", kind: "init", ops: [], changes: [{ text: "history started" }] });
      this.writeSnapshot(0, tl);
      this.writeFile();
      return;
    }

    const head = this.stateAt(this.rev);
    this.tl = head;
    const headHash = sha(canonicalText(head));
    const prevHash = this.entries.length > 1 ? this.entries[this.entries.length - 2].hash : null;
    const diskHash = fileText === null ? null : sha(fileText);

    if (diskHash === headHash) { this.lastWrittenHash = diskHash; return; }
    if (!parsed.ok || diskHash === prevHash) {
      // Broken/missing file, or the app stopped between logging a change and writing it.
      if (fileText !== null && !parsed.ok) {
        const keep = path.join(this.projectDir, `timeline.json.broken-${new Date().toISOString().replace(/[:.]/g, "-")}`);
        fs.writeFileSync(keep, fileText);
        this.bootNotes.push(`timeline.json was damaged (${parsed.reason.split("\n")[0]}). Restored the last good version (rev ${this.rev}); the damaged file is saved as ${path.basename(keep)}.`);
        this.push({ author: "app", kind: "recover", ops: [], changes: [{ text: `recovered timeline.json from history (rev ${this.rev})` }], note: path.basename(keep) });
      } else if (fileText === null) {
        this.bootNotes.push(`timeline.json was missing. Restored it from history (rev ${this.rev}).`);
      }
      this.writeFile();
      return;
    }
    // A valid file that differs from history: edited while the app was closed.
    this.lastWrittenHash = null;
    this.commitTimeline(parsed.tl, "claude", "edit", { note: "edited while the app was closed" });
  }

  private loadLog() {
    if (!fs.existsSync(this.logFile)) return;
    const lines = fs.readFileSync(this.logFile, "utf8").split("\n");
    for (const l of lines) {
      if (!l.trim()) continue;
      try { this.track(JSON.parse(l)); } catch { /* a torn last line from a crash: ignore */ }
    }
  }

  private parseText(text: string): { ok: true; tl: Timeline; migrated: boolean; warnings: string[] } | { ok: false; reason: string } {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, reason: `not valid JSON (${(e as Error).message})` }; }
    const m = migrate(raw, this.projectDir);
    const v = validate(m.timeline);
    if (!v.ok) return { ok: false, reason: v.errors.join("\n") };
    return { ok: true, tl: normalize(v.value!), migrated: m.migrated, warnings: v.warnings };
  }

  // ------------------------------------------------------------- reading history
  private snapshotPath(rev: number) { return path.join(this.histDir, `snap-${rev}.json`); }
  private writeSnapshot(rev: number, tl: Timeline) { atomicWrite(this.snapshotPath(rev), canonicalText(tl)); }

  /** The timeline as it was right after `rev`. */
  stateAt(rev: number): Timeline {
    const snaps = fs.readdirSync(this.histDir).map((f) => Number(/^snap-(\d+)\.json$/.exec(f)?.[1])).filter((n) => Number.isFinite(n) && n <= rev).sort((a, b) => b - a);
    for (const s of snaps) {
      try {
        let tl = JSON.parse(fs.readFileSync(this.snapshotPath(s), "utf8")) as Timeline;
        for (const e of this.entries) if (e.rev > s && e.rev <= rev && e.ops.length) tl = normalize(applyOps(tl, e.ops));
        return tl;
      } catch { /* damaged snapshot: try an older one */ }
    }
    throw new Error("No usable snapshot in .history/");
  }

  // ------------------------------------------------------------- committing
  private track(e: Entry) {
    this.entries.push(e);
    if (e.kind === "undo" && e.ref !== undefined) {
      this.undone.add(e.ref);
      const s = this.redo.get(e.author) || [];
      s.push(e.rev);
      this.redo.set(e.author, s);
    } else if (e.kind === "redo" && e.ref !== undefined) {
      this.undone.delete(e.ref);
      const s = this.redo.get(e.author) || [];
      s.pop();
      this.redo.set(e.author, s);
    } else if (e.kind === "revert" && e.ref !== undefined) {
      this.undone.add(e.ref);
    } else if (e.kind === "edit" || e.kind === "restore") {
      this.redo.set(e.author, []);
    }
  }

  private push(p: Omit<Entry, "rev" | "at" | "hash">): Entry {
    const e: Entry = { ...p, rev: this.rev + (this.entries.length ? 1 : 0), at: new Date().toISOString(), hash: sha(canonicalText(this.tl)) };
    appendLine(this.logFile, JSON.stringify(e));          // 1. log (fsynced) …
    this.track(e);
    if (e.rev > 0 && e.rev % SNAP_EVERY === 0) this.writeSnapshot(e.rev, this.tl);
    if (e.changes.length) {
      const { ops, ...summary } = e;
      void ops;
      appendLine(this.activityFile, JSON.stringify(summary));
    }
    return e;
  }

  private writeFile() {                                   // 2. … then the file
    const text = this.text;
    this.lastWrittenHash = sha(text);
    atomicWrite(this.file, text);
  }

  /** Make `next` the current timeline. Returns null if nothing changed. */
  private commitTimeline(next: Timeline, author: Author, kind: EntryKind, extra: { ref?: number; note?: string } = {}): Entry | null {
    const v = validate(next);
    if (!v.ok) throw new Conflict(`That change would leave the timeline invalid: ${v.errors[0]}`);
    const norm = normalize(v.value!);
    norm.nextId = Math.max(norm.nextId, this.tl?.nextId || 1);
    const ops = diff(this.tl, norm);
    if (!ops.length && norm.nextId === this.tl.nextId) {
      if (kind === "edit") { this.writeFileIfDifferent(); return null; }
    }
    const before = this.tl;
    this.tl = norm;
    this.warnings = v.warnings.filter((w) => !w.startsWith("nextId"));
    this.fileError = null;
    const entry = this.push({ author, kind, ops, changes: describe(ops, before, norm), ...extra });
    this.writeFile();
    return entry;
  }

  private writeFileIfDifferent() {
    try { if (fs.readFileSync(this.file, "utf8") === this.text) return; } catch { /* rewrite */ }
    this.writeFile();
  }

  /**
   * Apply ops made against `baseRev` (from the UI). They're checked against the CURRENT
   * timeline, so edits to different things merge even if Claude changed the file meanwhile.
   * New clip ids that are already taken get fresh ones (see idMap).
   */
  applyEdit(ops: Op[], author: Author): { entry: Entry | null; idMap: Record<string, string> } {
    const idMap = this.remapNewIds(ops);
    let tl = this.tl;
    for (const op of ops) {
      const why = precondition(tl, op);
      if (why) throw new Conflict(`Someone else changed this first: ${why}`, why);
      try { tl = applyOps(tl, [op]); } catch (e) { throw new Conflict((e as Error).message); }
    }
    const entry = this.commitTimeline(tl, author, "edit");
    return { entry, idMap };
  }

  private remapNewIds(ops: Op[]) {
    const taken = new Set<string>();
    for (const s of this.tl.sequences) for (const t of s.tracks) for (const c of t.clips) taken.add(c.id);
    let next = this.tl.nextId;
    const idMap: Record<string, string> = {};
    for (const op of ops) {
      if (op.t === "addClip" && taken.has(op.value.id)) {
        while (taken.has(`c${next}`)) next++;
        idMap[op.value.id] = `c${next}`;
        taken.add(`c${next}`);
      }
    }
    if (!Object.keys(idMap).length) return idMap;
    for (const op of ops) {
      if (op.t === "addClip" && idMap[op.value.id]) op.value = { ...op.value, id: idMap[op.value.id] };
      if (op.t === "set" && op.target.kind === "clip" && idMap[op.target.id]) op.target = { ...op.target, id: idMap[op.target.id] };
      if (op.t === "moveClip" && idMap[op.id]) op.id = idMap[op.id];
    }
    return idMap;
  }

  /** Someone (Claude) rewrote timeline.json. Returns the entry, or an error to show. */
  externalChange(): { entry: Entry | null; error?: string } {
    let text: string;
    try { text = fs.readFileSync(this.file, "utf8"); } catch { return { entry: null }; }
    const h = sha(text);
    if (h === this.lastWrittenHash) return { entry: null };
    const p = this.parseText(text);
    if (!p.ok) {
      this.fileError = `timeline.json has a problem, so the last good version is still showing:\n${p.reason}`;
      return { entry: null, error: this.fileError };
    }
    try {
      const entry = this.commitTimeline(p.tl, "claude", "edit");
      this.writeFileIfDifferent(); // write back the canonical form (frame-snapped, defaults filled)
      return { entry };
    } catch (e) {
      this.fileError = (e as Error).message;
      return { entry: null, error: this.fileError };
    }
  }

  // ------------------------------------------------------------- undo / redo / revert / restore
  private applyInverse(target: Entry, author: Author, kind: EntryKind, ref: number): Entry {
    const inverse = invertAll(target.ops);
    let tl = this.tl;
    for (const op of inverse) {
      const why = precondition(tl, op);
      if (why) throw new Conflict(`Can't ${kind} rev ${target.rev} (${target.changes[0]?.text || target.kind}): it was changed again since — ${why}`, why);
      try { tl = applyOps(tl, [op]); } catch (e) { throw new Conflict((e as Error).message); }
    }
    const e = this.commitTimeline(tl, author, kind, { ref });
    if (!e) throw new Conflict("Nothing to change.");
    return e;
  }

  /** Undo `author`'s most recent change that isn't already undone. */
  undo(author: Author): Entry {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.author !== author || !UNDOABLE.includes(e.kind) || this.undone.has(e.rev) || !e.ops.length || viewOnly(e)) continue;
      return this.applyInverse(e, author, "undo", e.rev);
    }
    throw new Conflict(author === "you" ? "Nothing of yours to undo." : `Nothing by ${author} to undo.`);
  }

  redoLast(author: Author): Entry {
    const stack = this.redo.get(author) || [];
    const uRev = stack[stack.length - 1];
    if (uRev === undefined) throw new Conflict("Nothing to redo.");
    const u = this.entries.find((e) => e.rev === uRev)!;
    return this.applyInverse(u, author, "redo", u.ref!);
  }

  /** Undo any single entry, by anyone, if nothing later depends on it. */
  revert(rev: number, author: Author): Entry {
    const e = this.entries.find((x) => x.rev === rev);
    if (!e || !e.ops.length) throw new Conflict(`rev ${rev} has nothing to revert.`);
    if (this.undone.has(rev)) throw new Conflict(`rev ${rev} is already undone.`);
    return this.applyInverse(e, author, "revert", rev);
  }

  /** Make the timeline look exactly like it did after `rev` (recorded as a new change). */
  restore(rev: number, author: Author): Entry {
    if (rev < 0 || rev > this.rev) throw new Conflict(`There's no rev ${rev}.`);
    const target = this.stateAt(rev);
    target.nextId = Math.max(target.nextId, this.tl.nextId);
    const e = this.commitTimeline(target, author, "restore", { ref: rev });
    if (!e) throw new Conflict(`The timeline already matches rev ${rev}.`);
    return e;
  }

  // ------------------------------------------------------------- queries
  canUndo(author: Author) {
    return this.entries.some((e) => e.author === author && UNDOABLE.includes(e.kind) && !this.undone.has(e.rev) && e.ops.length > 0 && !viewOnly(e));
  }
  canRedo(author: Author) { return (this.redo.get(author) || []).length > 0; }
  isUndone(rev: number) { return this.undone.has(rev); }
  summary(e: Entry) {
    const { ops, ...rest } = e;
    return { ...rest, opCount: ops.length, undone: this.undone.has(e.rev) };
  }
}
