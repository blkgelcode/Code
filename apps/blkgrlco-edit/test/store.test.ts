import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, Conflict } from "../server/store";
import { emptyTimeline, canonicalText, type Timeline, type MediaClip } from "../shared/model";
import { diff } from "../shared/ops";

function project(): { dir: string; store: Store } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blkstore-"));
  const tl = emptyTimeline("p");
  tl.media = [{ id: "m1", path: "/x/a.mp4", type: "video", duration: 20, fps: 30, width: 1080, height: 1920, hasAudio: true }];
  tl.sequences[0].tracks[0].clips = [
    { id: "c1", media: "m1", start: 0, in: 0, out: 4, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 },
    { id: "c2", media: "m1", start: 4, in: 4, out: 8, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 },
  ];
  tl.nextId = 3;
  fs.writeFileSync(path.join(dir, "timeline.json"), canonicalText(tl));
  const store = new Store(dir);
  store.boot();
  return { dir, store };
}
const clip = (s: Store, id: string) => s.tl.sequences[0].tracks.flatMap((t) => t.clips).find((c) => c.id === id) as MediaClip | undefined;
const edit = (s: Store, fn: (t: Timeline) => void) => { const n = structuredClone(s.tl); fn(n); return diff(s.tl, n); };
/** Simulate Claude rewriting timeline.json. */
function claudeWrites(dir: string, s: Store, fn: (t: any) => void) {
  const f = path.join(dir, "timeline.json");
  const t = JSON.parse(fs.readFileSync(f, "utf8"));
  fn(t);
  fs.writeFileSync(f, JSON.stringify(t, null, 2));
  return s.externalChange();
}

test("your edit and Claude's edit to different clips both land; each undoes only their own", () => {
  const { dir, store } = project();
  const base = structuredClone(store.tl);
  const myOps = diff(base, (() => { const n = structuredClone(base); n.sequences[0].tracks[0].clips[0].start = 1; return n; })());
  // Claude edits c2 on disk before my edit reaches the server
  claudeWrites(dir, store, (t) => { t.sequences[0].tracks[0].clips[1].in = 5; });
  assert.equal(clip(store, "c2")!.in, 5);
  store.applyEdit(myOps, "you");
  assert.equal(clip(store, "c1")!.start, 1);
  assert.equal(clip(store, "c2")!.in, 5, "Claude's change survived mine");
  // Claude: "undo my last change" → only c2 goes back
  store.undo("claude");
  assert.equal(clip(store, "c2")!.in, 4);
  assert.equal(clip(store, "c1")!.start, 1);
  // me: ⌘Z → only c1 goes back; then redo
  store.undo("you");
  assert.equal(clip(store, "c1")!.start, 0);
  store.redoLast("you");
  assert.equal(clip(store, "c1")!.start, 1);
  // the file on disk always matches
  assert.equal(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"), store.text);
});

test("editing the same property after someone else is refused, not overwritten", () => {
  const { dir, store } = project();
  const stale = edit(store, (t) => { t.sequences[0].tracks[0].clips[0].start = 2; });
  claudeWrites(dir, store, (t) => { t.sequences[0].tracks[0].clips[0].start = 3; });
  assert.throws(() => store.applyEdit(stale, "you"), (e: Conflict) => /c1\.start is now 3/.test(e.message));
  assert.equal(clip(store, "c1")!.start, 3);
});

test("undo is refused when a later change depends on it", () => {
  const { dir, store } = project();
  store.applyEdit(edit(store, (t) => { t.sequences[0].tracks[0].clips[0].start = 1; }), "you");
  claudeWrites(dir, store, (t) => { t.sequences[0].tracks[0].clips[0].start = 1.5; });
  assert.throws(() => store.undo("you"), Conflict);
  assert.equal(clip(store, "c1")!.start, 1.5);
});

test("new clip ids that collide get fresh ids", () => {
  const { dir, store } = project();
  const mine = edit(store, (t) => { t.sequences[0].tracks[0].clips.push({ id: "c3", media: "m1", start: 8, in: 0, out: 2, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 }); });
  claudeWrites(dir, store, (t) => { t.sequences[0].tracks[0].clips.push({ id: "c3", media: "m1", start: 12, in: 0, out: 1 }); t.nextId = 4; });
  const { idMap } = store.applyEdit(mine, "you");
  assert.deepEqual(idMap, { c3: "c4" });
  assert.equal(clip(store, "c4")!.start, 8);
  assert.equal(clip(store, "c3")!.start, 12);
});

test("revert any single entry, and restore any earlier revision", () => {
  const { store } = project();
  const r1 = store.applyEdit(edit(store, (t) => { t.sequences[0].tracks[0].clips[0].start = 1; }), "you").entry!.rev;
  store.applyEdit(edit(store, (t) => { (t.sequences[0].tracks[0].clips[1] as MediaClip).out = 7; }), "you");
  store.revert(r1, "claude");
  assert.equal(clip(store, "c1")!.start, 0);
  assert.equal(clip(store, "c2")!.out, 7);
  store.restore(0, "you");
  assert.equal(clip(store, "c2")!.out, 8);
  store.undo("you"); // undo the restore
  assert.equal(clip(store, "c2")!.out, 7);
});

test("crash recovery: a broken file is restored from history and kept aside", () => {
  const { dir, store } = project();
  store.applyEdit(edit(store, (t) => { t.sequences[0].tracks[0].clips[0].start = 1; }), "you");
  fs.writeFileSync(path.join(dir, "timeline.json"), '{"version": 2, "proj');
  const again = new Store(dir);
  again.boot();
  assert.equal(clip(again, "c1")!.start, 1);
  assert.ok(again.bootNotes[0].includes("damaged"));
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("timeline.json.broken-")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8")).sequences[0].tracks[0].clips[0].start, 1);
});

test("crash between logging and writing: the logged change wins on restart", () => {
  const { dir, store } = project();
  const before = fs.readFileSync(path.join(dir, "timeline.json"), "utf8");
  store.applyEdit(edit(store, (t) => { t.sequences[0].tracks[0].clips[0].start = 2; }), "you");
  fs.writeFileSync(path.join(dir, "timeline.json"), before); // as if the write never happened
  const again = new Store(dir);
  again.boot();
  assert.equal(clip(again, "c1")!.start, 2);
  assert.equal(again.entries.at(-1)!.author, "you");
});

test("edits made while the app was closed are recorded as Claude's", () => {
  const { dir } = project();
  const f = path.join(dir, "timeline.json");
  const t = JSON.parse(fs.readFileSync(f, "utf8"));
  t.sequences[0].tracks[0].clips[1].start = 9;
  fs.writeFileSync(f, JSON.stringify(t));
  const again = new Store(dir);
  again.boot();
  assert.equal(clip(again, "c2")!.start, 9);
  assert.equal(again.entries.at(-1)!.author, "claude");
  assert.equal(again.entries.at(-1)!.note, "edited while the app was closed");
});

test("history survives restarts and snapshots replay to the same state", () => {
  const { dir, store } = project();
  const byId = (t: Timeline, id: string) => t.sequences[0].tracks[0].clips.find((c) => c.id === id) as MediaClip;
  for (let i = 1; i <= 120; i++) store.applyEdit(edit(store, (t) => { byId(t, "c1").start = 8 + i / 10; }), i % 2 ? "you" : "claude");
  const again = new Store(dir);
  again.boot();
  assert.equal(again.rev, store.rev);
  assert.equal(again.text, store.text);
  assert.equal(byId(again.tl, "c1").start, 20);
  assert.equal(byId(again.stateAt(60), "c1").start, 14);   // replayed from snap-50 + 10 ops
  assert.ok(fs.existsSync(path.join(dir, ".history", "snap-100.json")));
});
