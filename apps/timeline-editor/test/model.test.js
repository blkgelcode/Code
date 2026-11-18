import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTimeline, normalize, migrate, moveClip, trimClip, splitClip, deleteClip, addMediaClip, addTextClip,
  diffTimelines, totalDuration, nextId, findClip, seqOf, linkedPartners, unlinkClip,
} from "../src/lib/model.js";

/** Picture c1+c2 (each with linked sound c1a/c2a) and music c3. */
function sample() {
  const tl = defaultTimeline();
  tl.media.push({ id: "m1", file: "a.mp4", kind: "video", duration: 10, hasAudio: true });
  tl.media.push({ id: "m2", file: "b.mp3", kind: "audio", duration: 30 });
  const t = (id) => seqOf(tl).tracks.find((x) => x.id === id);
  t("v1").clips.push(
    { id: "c1", media: "m1", start: 0, in: 0, out: 4, link: "L1" },
    { id: "c2", media: "m1", start: 4, in: 5, out: 9, link: "L2" },
  );
  t("a1").clips.push(
    { id: "c1a", media: "m1", start: 0, in: 0, out: 4, link: "L1" },
    { id: "c2a", media: "m1", start: 4, in: 5, out: 9, link: "L2" },
  );
  seqOf(tl).tracks.push({ id: "a2", kind: "audio", name: "Music", muted: false, volume: 1, clips: [{ id: "c3", media: "m2", start: 0, in: 0, out: 8, volume: 0.5 }] });
  const r = normalize(tl);
  assert.deepEqual(r.errors, []);
  return r.timeline;
}
const clip = (tl, id) => findClip(tl, id).clip;

test("normalize fills defaults and accepts a valid v2 timeline", () => {
  const tl = sample();
  assert.equal(clip(tl, "c1").fit, "cover");
  assert.deepEqual(clip(tl, "c1").color, { input: "auto", look: "project" });
  assert.equal(clip(tl, "c1a").volume, 1);
  assert.equal(totalDuration(tl), 8);
});

test("normalize reports overlaps, bad ranges, missing media and duplicate ids", () => {
  const tl = sample();
  const v1 = seqOf(tl).tracks.find((t) => t.id === "v1");
  v1.clips[1].start = 3;
  v1.clips.push({ id: "c1", media: "m9", start: 20, in: 3, out: 2 });
  const { timeline, errors } = normalize(tl);
  assert.equal(timeline, null);
  assert.ok(errors.some((e) => e.includes("overlap")), errors.join());
  assert.ok(errors.some((e) => e.includes('duplicate id "c1"')));
  assert.ok(errors.some((e) => e.includes('media "m9"')));
});

test("v1 files migrate: one sequence, video sound becomes a linked audio clip with the volume", () => {
  const v1 = {
    version: 1,
    settings: { width: 1080, height: 1920, fps: 30, background: "#000000" },
    media: [{ id: "m1", file: "a.mp4", kind: "video", duration: 10, hasAudio: true }, { id: "m2", file: "b.mp3", kind: "audio", duration: 20 }],
    tracks: [
      { id: "v1", kind: "video", name: "Video 1", volume: 0.5, clips: [{ id: "c1", media: "m1", start: 0, in: 1, out: 5, volume: 0.8 }] },
      { id: "a1", kind: "audio", name: "Music", clips: [{ id: "c2", media: "m2", start: 0, in: 0, out: 10 }] },
    ],
  };
  const { timeline, errors, migrated } = normalize(v1);
  assert.deepEqual(errors, []);
  assert.equal(migrated, true);
  const seq = seqOf(timeline);
  assert.equal(seq.settings.height, 1920);
  const cam = seq.tracks.find((t) => t.name === "Camera audio");
  assert.ok(cam, "music track was busy, so a camera audio track was added");
  assert.deepEqual([cam.clips[0].media, cam.clips[0].in, cam.clips[0].out, cam.clips[0].volume], ["m1", 1, 5, 0.4]);
  assert.equal(cam.clips[0].link, clip(timeline, "c1").link);
  assert.equal(clip(timeline, "c1").volume, undefined);
  assert.equal(migrate(timeline), timeline, "v2 passes through untouched");
});

test("cut the first 3 seconds of a clip trims its linked sound too", () => {
  const tl = trimClip(sample(), "c2", "start", 7);
  for (const id of ["c2", "c2a"]) assert.deepEqual([clip(tl, id).start, clip(tl, id).in, clip(tl, id).out], [7, 8, 9], id);
  const alone = trimClip(sample(), "c2", "start", 7, { linked: false });
  assert.equal(clip(alone, "c2a").start, 4, "Option-trim leaves the partner (that's a J/L cut)");
});

test("moving a clip moves its partner; refused if the partner would overlap", () => {
  const tl = moveClip(sample(), "c2", 12);
  assert.equal(clip(tl, "c2a").start, 12);
  const blocked = sample();
  seqOf(blocked).tracks.find((t) => t.id === "a1").clips.push({ id: "c9", media: "m2", start: 13, in: 0, out: 2 });
  assert.equal(moveClip(normalize(blocked).timeline, "c2", 12), null);
  assert.equal(moveClip(sample(), "c1", 1, "a1"), null, "picture can't go on an audio track");
});

test("split cuts the linked pair into two linked pairs", () => {
  const tl = splitClip(sample(), "c2", 5.5);
  const right = seqOf(tl).tracks.find((t) => t.id === "v1").clips.at(-1);
  const rightA = seqOf(tl).tracks.find((t) => t.id === "a1").clips.at(-1);
  assert.deepEqual([right.start, right.in, rightA.in, clip(tl, "c2").out], [5.5, 6.5, 6.5, 6.5]);
  assert.ok(right.link && right.link === rightA.link && right.link !== "L2");
  assert.equal(splitClip(sample(), "c2", 1), null);
});

test("delete takes the partner; ripple closes the gap; Option-delete leaves the partner unlinked", () => {
  let tl = deleteClip(sample(), "c1", { ripple: true });
  assert.equal(findClip(tl, "c1a"), null);
  assert.equal(clip(tl, "c2").start, 0);
  tl = deleteClip(sample(), "c1", { linked: false });
  assert.ok(findClip(tl, "c1a"));
  assert.equal(clip(tl, "c1a").link, undefined);
  assert.deepEqual(linkedPartners(unlinkClip(sample(), "c2"), "c2"), []);
});

test("adding a video with sound places a linked pair; on an audio track only the sound", () => {
  const r = addMediaClip(sample(), "m1", "v1", null);
  assert.equal(r.clipIds.length, 2);
  const [v, a] = r.clipIds.map((id) => findClip(r.timeline, id));
  assert.equal(v.track.kind, "video");
  assert.equal(a.track.kind, "audio");
  assert.equal(v.clip.link, a.clip.link);
  assert.equal(v.clip.start, 8);
  const s = addMediaClip(sample(), "m1", "a2", 20);
  assert.equal(s.clipIds.length, 1);
  assert.equal(findClip(s.timeline, s.clipId).track.id, "a2");
  let t = addTextClip(sample(), 5).timeline;
  t = addTextClip(t, 6).timeline;
  assert.equal(seqOf(t).tracks.filter((x) => x.kind === "text").length, 2);
  assert.ok(normalize(t).timeline);
});

test("nextId never reuses an id, including link ids", () => {
  assert.equal(nextId(sample(), "c"), "c4");
  assert.equal(nextId(sample(), "L"), "L3");
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
