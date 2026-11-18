import test from "node:test";
import assert from "node:assert/strict";
import { emptyTimeline, validate, normalize, migrate, toGrid, type Timeline } from "../shared/model";
import { diff, applyOps, invertAll, conflictBetween, describe } from "../shared/ops";

function sample(): Timeline {
  const tl = emptyTimeline("t");
  tl.media = [
    { id: "m1", path: "/v/a.mp4", type: "video", duration: 10, width: 1080, height: 1920, fps: 30, hasAudio: true },
    { id: "m2", path: "/v/song.wav", type: "audio", duration: 60 },
  ];
  const [v1, a1, t1] = tl.sequences[0].tracks;
  v1.clips.push({ id: "c1", media: "m1", start: 0, in: 0, out: 4, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  v1.clips.push({ id: "c2", media: "m1", start: 4, in: 5, out: 9, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  a1.clips.push({ id: "c3", media: "m2", start: 0, in: 0, out: 8, volume: 0.4, fadeIn: 0, fadeOut: 1 });
  t1.clips.push({ id: "c4", start: 1, duration: 2, text: "day 21", style: { font: "default", size: 120, color: "#A8B118", x: 0.5, y: 0.15, align: "center", bold: true, shadow: false }, fadeIn: 0, fadeOut: 0 });
  tl.nextId = 5;
  return tl;
}

test("sample is valid and already canonical", () => {
  const v = validate(sample());
  assert.deepEqual(v.errors, []);
  assert.deepEqual(normalize(v.value!), sample());
});

test("validation names the clip and field, and rejects unknown fields", () => {
  const tl: any = sample();
  tl.sequences[0].tracks[0].clips[1].strat = 3;
  tl.sequences[0].tracks[0].clips[0].out = 12;
  tl.sequences[0].tracks[2].clips[0].media = "m1";
  const { errors } = validate(tl);
  assert.ok(errors.some((e) => e.includes("c2") && e.includes('unknown field "strat"')), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("c1") && e.includes("past the end")), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("c4") && e.includes("media clips belong on a video or audio track")), errors.join("\n"));
});

test("diff → apply reproduces the target; inverse restores the original", () => {
  const a = sample();
  const b = structuredClone(a);
  const s = b.sequences[0];
  s.tracks[0].clips[0].start = 1.5;                                     // move
  (s.tracks[0].clips[1] as any).in = 6;                                 // trim
  s.tracks[2].clips[0] = { ...(s.tracks[2].clips[0] as any), text: "day 22", style: { ...(s.tracks[2].clips[0] as any).style, size: 140 } };
  s.tracks.push({ id: "v2", kind: "video", name: "Video 2", muted: false, hidden: false, locked: false, solo: false, volume: 1, clips: [] });
  const moved = s.tracks[0].clips.splice(1, 1)[0];                      // c2 → new track v2
  s.tracks[3].clips.push(moved);
  s.tracks[1].clips = [];                                               // delete c3
  b.media.splice(1, 1);                                                 // and its media
  b.sequences.push({ id: "s2", name: "Shorts", width: 1080, height: 1920, fps: 30, background: "#000000", tracks: [
    { id: "v1", kind: "video", name: "Video 1", muted: false, hidden: false, locked: false, solo: false, volume: 1, clips: [{ id: "c9", media: "m1", start: 0, in: 0, out: 2, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 }] }] });
  [s.tracks[0], s.tracks[1]] = [s.tracks[1], s.tracks[0]];              // reorder
  const ops = diff(a, b);
  const got = applyOps(a, ops);
  assert.deepEqual(normalize(got), normalize(b));
  assert.deepEqual(normalize(applyOps(got, invertAll(ops))), normalize(a));
  const words = describe(ops, a, b).map((c) => c.text).join(" | ");
  assert.match(words, /c1 moved 0:00.00 → 0:01.50/);
  assert.match(words, /c2 trimmed: in 5s → 6s/);
  assert.match(words, /moved c2 to Video 2/);
  assert.match(words, /deleted c3/);
  assert.match(words, /c4 text → "day 22"; style: size/);
});

test("edits to different clips don't conflict; the same property does", () => {
  const a = sample();
  const mine = structuredClone(a); mine.sequences[0].tracks[0].clips[0].start = 2;
  const theirs = structuredClone(a); (theirs.sequences[0].tracks[0].clips[1] as any).out = 8;
  assert.equal(conflictBetween(diff(a, mine), diff(a, theirs)), null);
  const same = structuredClone(a); same.sequences[0].tracks[0].clips[0].start = 3;
  assert.equal(conflictBetween(diff(a, mine), diff(a, same)), "clip:c1.start");
  const deleted = structuredClone(a); deleted.sequences[0].tracks[0].clips.shift();
  assert.ok(conflictBetween(diff(a, mine), diff(a, deleted)));
});

test("normalize snaps to the frame grid and never runs past the media", () => {
  assert.equal(toGrid(1.0001, 30), 1);
  assert.equal(toGrid(1 / 3, 30), 0.333333);
  const tl = sample();
  tl.sequences[0].tracks[0].clips[0].start = 0.51;
  (tl.sequences[0].tracks[0].clips[1] as any).out = 9.99;
  const n = normalize(validate(tl).value!);
  assert.equal(n.sequences[0].tracks[0].clips[0].start, 0.5);
  assert.equal((n.sequences[0].tracks[0].clips[1] as any).out, 10);
});

test("v1 files migrate to v2", () => {
  const v1 = {
    version: 1, project: { name: "old", width: 1080, height: 1920, fps: 30, background: "#000000" },
    media: [{ id: "m1", file: "clip.mp4", type: "video", duration: 5, width: 720, height: 1280, fps: 30, hasAudio: true }],
    tracks: [
      { id: "v1", kind: "video", name: "Video 1", muted: false, hidden: false, clips: [{ id: "c1", media: "m1", start: 0, in: 1, out: 3, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 }] },
      { id: "t1", kind: "text", name: "Text 1", muted: false, hidden: false, clips: [{ id: "c2", start: 1, duration: 2, text: "hi", style: { size: 80 }, fadeIn: 0, fadeOut: 0 }] },
    ],
    nextId: 3,
  };
  const { timeline, migrated } = migrate(v1, "/proj");
  assert.ok(migrated);
  const v = validate(timeline);
  assert.deepEqual(v.errors, []);
  assert.equal(v.value!.media[0].path, "/proj/media/clip.mp4");
  assert.equal((v.value!.sequences[0].tracks[1].clips[0] as any).style.color, "#FFFFFF");
});
