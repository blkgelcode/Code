import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTimeline, normalize, moveClip, trimClip, splitClip, deleteClip, addMediaClip, addTextClip,
  diffTimelines, totalDuration, nextId, findClip,
} from "../src/lib/model.js";

function sample() {
  const tl = defaultTimeline();
  tl.media.push({ id: "m1", file: "a.mp4", kind: "video", duration: 10, hasAudio: true });
  tl.media.push({ id: "m2", file: "b.mp3", kind: "audio", duration: 30 });
  tl.tracks.find((t) => t.id === "v1").clips.push(
    { id: "c1", media: "m1", start: 0, in: 0, out: 4 },
    { id: "c2", media: "m1", start: 4, in: 5, out: 9 },
  );
  tl.tracks.find((t) => t.id === "a1").clips.push({ id: "c3", media: "m2", start: 0, in: 0, out: 8, volume: 0.5 });
  return normalize(tl).timeline;
}

test("normalize fills defaults and accepts a valid timeline", () => {
  const tl = sample();
  assert.equal(tl.tracks.find((t) => t.id === "v1").clips[0].fit, "cover");
  assert.equal(tl.tracks.find((t) => t.id === "v1").clips[0].volume, 1);
  assert.equal(totalDuration(tl), 8);
});

test("normalize reports overlaps, bad ranges, missing media and duplicate ids", () => {
  const tl = sample();
  tl.tracks[1].clips[1].start = 3; // overlaps c1
  tl.tracks[1].clips.push({ id: "c1", media: "m9", start: 20, in: 3, out: 2 });
  const { timeline, errors } = normalize(tl);
  assert.equal(timeline, null);
  assert.ok(errors.some((e) => e.includes("overlap")), errors.join());
  assert.ok(errors.some((e) => e.includes('duplicate id "c1"')));
  assert.ok(errors.some((e) => e.includes('media "m9"')));
});

test("normalize rejects out past the media's end", () => {
  const tl = sample();
  tl.tracks[1].clips[1].out = 12;
  assert.ok(normalize(tl).errors.some((e) => e.includes("past the end")));
});

test("cut the first 3 seconds of a clip = in += 3 and start += 3", () => {
  const tl = trimClip(sample(), "c2", "start", 7);
  const { clip } = findClip(tl, "c2");
  assert.deepEqual([clip.start, clip.in, clip.out], [7, 8, 9]);
});

test("trim end can't run into the next clip or past the source", () => {
  let tl = trimClip(sample(), "c1", "end", 6);
  assert.equal(findClip(tl, "c1").clip.out, 4); // c2 starts at 4
  tl = trimClip(sample(), "c2", "end", 50);
  assert.equal(findClip(tl, "c2").clip.out, 10); // media is 10s
});

test("move refuses overlaps and only allows tracks of the same kind", () => {
  assert.equal(moveClip(sample(), "c1", 2), null);
  assert.equal(moveClip(sample(), "c1", 1, "a1"), null);
  const tl = moveClip(sample(), "c2", 12);
  assert.equal(findClip(tl, "c2").clip.start, 12);
});

test("split makes two clips that cover the same source", () => {
  const tl = splitClip(sample(), "c2", 5.5);
  const v1 = tl.tracks.find((t) => t.id === "v1").clips;
  assert.equal(v1.length, 3);
  const [a, b] = [findClip(tl, "c2").clip, v1.find((c) => c.id === "c4")];
  assert.deepEqual([a.in, a.out, b.start, b.in, b.out], [5, 6.5, 5.5, 6.5, 9]);
  assert.equal(splitClip(sample(), "c2", 1), null);
});

test("add media appends to the end; add title finds a free text track", () => {
  const r = addMediaClip(sample(), "m1", "v1", null);
  assert.equal(findClip(r.timeline, r.clipId).clip.start, 8);
  let t = addTextClip(sample(), 5).timeline;
  t = addTextClip(t, 6).timeline; // overlaps the first title -> second text track
  assert.equal(t.tracks.filter((x) => x.kind === "text").length, 2);
  assert.ok(normalize(t).timeline);
});

test("nextId never reuses an id", () => {
  assert.equal(nextId(deleteClip(sample(), "c3"), "c"), "c3");
  assert.equal(nextId(sample(), "c"), "c4");
});

test("diff describes moves, trims, adds and deletes with clip ids", () => {
  const a = sample();
  let b = moveClip(a, "c2", 12);
  b = trimClip(b, "c1", "end", 3);
  b = deleteClip(b, "c3");
  const texts = diffTimelines(a, b).map((c) => c.text);
  assert.ok(texts.some((t) => t.startsWith("c2:") && t.includes("start 4s → 12s")), texts.join("\n"));
  assert.ok(texts.some((t) => t.startsWith("c1:") && t.includes("trimmed")));
  assert.ok(texts.some((t) => t.startsWith("Deleted c3")));
});
