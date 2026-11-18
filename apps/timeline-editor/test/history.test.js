// Undo/redo across authors, selective undo, persistence, recovery. Uses a
// throwaway project folder (set before the server modules load).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tl-history-"));
process.env.PROJECT_DIR = dir;
const { TimelineStore, TIMELINE_FILE, serialize } = await import("../server/store.js");
const { diff, apply, overlaps } = await import("../src/lib/patch.js");
const { addTextClip, moveClip, findClip, updateProject } = await import("../src/lib/model.js");

const clip = (s, id) => findClip(s.timeline, id)?.clip;
const outsideEdit = (store, tl) => {
  fs.writeFileSync(TIMELINE_FILE, serialize(tl)); // what Claude does
  store.fileChanged();
};

test("patches round-trip", () => {
  const a = { x: 1, list: [{ id: 1 }, { id: 2 }], o: { k: "v" } };
  const b = { x: 2, list: [{ id: 1 }], o: { k: "v", n: 3 }, add: true };
  assert.deepEqual(apply(a, diff(a, b)), b);
  assert.deepEqual(apply(b, diff(b, a)), a);
  assert.ok(overlaps([{ path: "/a/b" }], [{ path: "/a" }]));
  assert.ok(!overlaps([{ path: "/a/b" }], [{ path: "/a/c" }]));
});

test("undo/redo works across both authors and survives a restart", () => {
  let s = new TimelineStore();
  const t1 = addTextClip(s.timeline, 1, "mine").timeline; // c1
  assert.ok(s.write(t1, "user").ok);
  outsideEdit(s, addTextClip(s.timeline, 5, "claude's").timeline); // c2, by "Claude"
  assert.ok(clip(s, "c2"));
  const revBefore = s.rev;

  s.undo("user"); // undoes Claude's change: the latest, whoever made it
  assert.equal(clip(s, "c2"), undefined);
  assert.ok(clip(s, "c1"));
  assert.ok(s.rev > revBefore);
  assert.equal(JSON.parse(fs.readFileSync(TIMELINE_FILE, "utf8")).sequences[0].tracks[0].clips.length, 1, "file on disk updated");

  s = new TimelineStore(); // restart
  assert.equal(s.history.status().canRedo.author, "claude");
  s.redo("claude");
  assert.ok(clip(s, "c2"));
  s.undo("claude");
  s.undo("claude");
  assert.equal(clip(s, "c1"), undefined);
  assert.throws(() => s.undo("user"), /Nothing to undo/);
  s.redo("user");
  s.redo("user");
  assert.ok(clip(s, "c2"));
});

test("a new change after undo drops the redo branch", () => {
  const s = new TimelineStore();
  s.undo("user");
  s.write(addTextClip(s.timeline, 9, "branch").timeline, "user");
  assert.equal(s.history.status().canRedo, null);
});

test("selective undo of an earlier change, and refusal when a later change touched it", () => {
  const s = new TimelineStore();
  s.write(updateProject(s.timeline, { name: "Seoul" }), "user");
  const nameSeq = s.history.entries.at(-1).seq;
  s.write(updateProject(s.timeline, { channel: "@blkgrlco" }), "user");
  // undo just the name change: the later channel change stays
  s.undoEntry(nameSeq, "claude");
  assert.equal(s.timeline.project.channel, "@blkgrlco");
  assert.notEqual(s.timeline.project.name, "Seoul");

  const firstClip = s.timeline.sequences[0].tracks[0].clips[0].id;
  s.write(moveClip(s.timeline, firstClip, 20), "user");
  const moveSeq = s.history.entries.at(-1).seq;
  s.write(moveClip(s.timeline, firstClip, 30), "user");
  assert.throws(() => s.undoEntry(moveSeq, "user"), /touched the same clips/);
});

test("a broken timeline.json pauses editing and can be restored from the last good copy", () => {
  const s = new TimelineStore();
  const good = JSON.stringify(s.timeline);
  fs.writeFileSync(TIMELINE_FILE, "{ broken");
  s.fileChanged();
  assert.ok(s.errors.length);
  assert.throws(() => s.undo("user"), /has errors/);
  s.recover("user");
  assert.equal(JSON.stringify(s.timeline), good);
  assert.deepEqual(new TimelineStore().errors, []);
});

test("named versions and autosave snapshots can be restored, as an undoable change", () => {
  const s = new TimelineStore();
  s.saveVersion("before rough cut", "user");
  const before = JSON.stringify(s.timeline);
  s.write(addTextClip(s.timeline, 40, "later").timeline, "user");
  const v = s.history.listVersions().find((x) => x.name === "before rough cut");
  s.restoreVersion(v.id, "claude");
  assert.equal(JSON.stringify(s.timeline), before);
  s.undo("user");
  assert.notEqual(JSON.stringify(s.timeline), before);
  assert.ok(s.history.listVersions().some((x) => x.kind === "snapshot"), "first change made an autosave");
});

test("changes made while the app was closed are recorded as Claude's on start", () => {
  const s = new TimelineStore();
  fs.writeFileSync(TIMELINE_FILE, serialize(addTextClip(s.timeline, 50, "offline edit").timeline));
  const s2 = new TimelineStore();
  const last = s2.history.entries.at(-1);
  assert.equal(last.author, "claude");
  assert.ok(last.changes[0].text.includes("while the app was closed"));
});

test("change records address items by id: undo an old track add after later clip edits", () => {
  const s = new TimelineStore();
  const base = s.timeline;
  const withTrack = JSON.parse(JSON.stringify(base));
  withTrack.sequences[0].tracks.unshift({ id: "tX", kind: "text", name: "Extra", hidden: false, clips: [] });
  s.write(withTrack, "claude");
  const trackSeq = s.history.entries.at(-1).seq;
  const firstClip = s.timeline.sequences[0].tracks.find((t) => t.clips.length).clips[0].id;
  s.write(moveClip(s.timeline, firstClip, 70), "user");
  s.undoEntry(trackSeq, "user"); // removes tX by id, keeps the later move
  assert.ok(!s.timeline.sequences[0].tracks.some((t) => t.id === "tX"));
  assert.equal(findClip(s.timeline, firstClip).clip.start, 70);
  const a = { list: [{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 3 }] };
  const b = { list: [{ id: "c", v: 3 }, { id: "d", v: 4 }, { id: "a", v: 9 }] };
  assert.deepEqual(apply(a, diff(a, b)), b);
  assert.deepEqual(apply(b, diff(b, a)), a);
});
