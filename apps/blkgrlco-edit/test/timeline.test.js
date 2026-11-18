import test from "node:test";
import assert from "node:assert/strict";
import { emptyTimeline, validate, normalize, diffTimelines, timelineDuration } from "../server/timeline.js";
import * as ops from "../src/ops.js";

const base = () => {
  const tl = emptyTimeline("t");
  tl.media = [
    { id: "m1", file: "a.mp4", type: "video", duration: 10, width: 1080, height: 1920, fps: 30, hasAudio: true },
    { id: "m2", file: "song.wav", type: "audio", duration: 60 },
    { id: "m3", file: "p.jpg", type: "image", duration: null, width: 800, height: 600 },
  ];
  return tl;
};

test("empty timeline is valid", () => {
  assert.deepEqual(validate(emptyTimeline()).errors, []);
});

test("validation catches the mistakes a hand edit can make", () => {
  const tl = base();
  tl.tracks[0].clips.push({ id: "c1", media: "m1", start: 0, in: 4, out: 2 });
  tl.tracks[0].clips.push({ id: "c1", media: "m9", start: 1, in: 0, out: 1 });
  tl.tracks[1].clips.push({ id: "c3", media: "m3", start: 0, in: 0, out: 3 });
  tl.tracks[0].clips.push({ id: "c4", media: "m1", start: 0, in: 0, out: 12 });
  const { errors } = validate(tl);
  assert.ok(errors.some((e) => e.includes("out (2) must be after in (4)")));
  assert.ok(errors.some((e) => e.includes("duplicate clip id c1")));
  assert.ok(errors.some((e) => e.includes('media "m9"')));
  assert.ok(errors.some((e) => e.includes("is an image")));
  assert.ok(errors.some((e) => e.includes("past the end")));
});

test("overlaps are warnings, not errors", () => {
  const tl = base();
  tl.tracks[0].clips.push({ id: "c1", media: "m1", start: 0, in: 0, out: 5 }, { id: "c2", media: "m1", start: 3, in: 0, out: 5 });
  tl.nextId = 3;
  const r = validate(tl);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});

test("normalize bumps nextId past existing ids and fills text style", () => {
  const tl = base();
  tl.nextId = 1;
  tl.tracks[2].clips.push({ id: "c7", start: 1, duration: 2, text: "hi" });
  const n = normalize(tl);
  assert.equal(n.nextId, 8);
  assert.equal(n.tracks[2].clips[0].style.size, 96);
});

test("add, move, trim, split, delete", () => {
  let tl = normalize(base());
  let r = ops.addMediaClip(tl, { mediaId: "m1", trackId: "v1", start: 0 });
  tl = r.timeline;
  assert.equal(r.clipId, "c1");
  tl = ops.trimClip(tl, "c1", "start", 3); // cut the first 3 s
  let c = ops.findClip(tl, "c1").clip;
  assert.deepEqual([c.start, c.in, c.out], [3, 3, 10]);
  tl = ops.moveClip(tl, "c1", { start: 0 });
  tl = ops.trimClip(tl, "c1", "end", 50); // can't run past the media's end
  c = ops.findClip(tl, "c1").clip;
  assert.equal(c.out, 10);
  const s = ops.splitClip(tl, "c1", 2);
  tl = s.timeline;
  const left = ops.findClip(tl, "c1").clip;
  const right = ops.findClip(tl, s.newId).clip;
  assert.deepEqual([left.in, left.out, right.start, right.in, right.out], [3, 5, 2, 5, 10]);
  assert.equal(timelineDuration(tl), 7);
  tl = ops.deleteClip(tl, "c1");
  assert.equal(ops.findClip(tl, "c1"), null);
  assert.deepEqual(validate(tl).errors, []);
});

test("media only goes on tracks that can hold it", () => {
  const tl = normalize(base());
  assert.equal(ops.addMediaClip(tl, { mediaId: "m2", trackId: "v1", start: 0 }).clipId, null);
  assert.equal(ops.addMediaClip(tl, { mediaId: "m3", trackId: "a1", start: 0 }).clipId, null);
  assert.ok(ops.addMediaClip(tl, { mediaId: "m1", trackId: "a1", start: 0 }).clipId); // a video's audio on an audio track
});

test("diff describes changes in plain words", () => {
  let a = normalize(base());
  a = ops.addMediaClip(a, { mediaId: "m1", trackId: "v1", start: 0 }).timeline;
  let b = ops.trimClip(a, "c1", "start", 3);
  b = ops.addTextClip(b, { trackId: "t1", start: 5, text: "day 21" }).timeline;
  const changes = diffTimelines(a, b).map((c) => c.text);
  assert.ok(changes.some((t) => t.startsWith("trimmed c1: in 0s → 3s")), changes.join("|"));
  assert.ok(changes.some((t) => t.includes('added c2 ("day 21") on Text 1 at 0:05.00')), changes.join("|"));
});

test("snap pulls to nearby edges only", () => {
  assert.equal(ops.snap(4.97, [0, 5, 10], 0.1), 5);
  assert.equal(ops.snap(4.5, [0, 5, 10], 0.1), 4.5);
});
