// Phase 4 editing engine: three-point edits, ripple/roll/slip/slide, links, nesting, markers,
// clipboard, timecode, flattening — and every result must still pass the app's validator.
import test from "node:test";
import assert from "node:assert/strict";
import * as X from "../shared/editing";
import { flatten } from "../shared/flatten";
import { toTimecode, parseTimecode } from "../shared/timecode";
import { validate, normalize, emptyTimeline, clipEnd, type Timeline, type MediaClip, type Clip } from "../shared/model";
import { diff, applyOps } from "../shared/ops";

function fixture(): Timeline {
  const tl = emptyTimeline("t") as Timeline;
  tl.media = [
    { id: "m1", path: "/x/a.mp4", name: "a.mp4", type: "video", duration: 20, width: 1080, height: 1920, fps: 30, hasAudio: true } as any,
    { id: "m2", path: "/x/music.wav", name: "music.wav", type: "audio", duration: 60, hasAudio: true } as any,
    { id: "m3", path: "/x/b.mp4", name: "b.mp4", type: "video", duration: 10, width: 1080, height: 1920, fps: 30, hasAudio: true } as any,
  ];
  const s = tl.sequences[0];
  const mc = (id: string, media: string, start: number, a: number, b: number, link?: string): MediaClip =>
    ({ id, media, start, in: a, out: b, volume: 1, fadeIn: 0, fadeOut: 0, ...(link ? { link } : {}) });
  s.tracks[0].clips = [{ ...mc("c1", "m1", 0, 0, 4, "L1"), fit: "cover" }, { ...mc("c2", "m1", 4, 10, 14, "L2"), fit: "cover" }];
  s.tracks[1].clips = [mc("c3", "m1", 0, 0, 4, "L1"), mc("c4", "m1", 4, 10, 14, "L2")];
  s.tracks.splice(2, 0, { id: "a2", kind: "audio", name: "Music", muted: false, hidden: false, locked: false, solo: false, volume: 1, syncLock: true, targeted: false, clips: [mc("c5", "m2", 0, 0, 8)] });
  tl.nextId = 6;
  return tl;
}
const ok = (r: X.Result) => {
  assert.ok(r.ok, r.message);
  const v = validate(JSON.parse(JSON.stringify(r.timeline)));
  assert.ok(v.ok, v.errors.join("\n"));
  return r.timeline;
};
const clip = (tl: Timeline, id: string) => tl.sequences.flatMap((s) => s.tracks.flatMap((t) => t.clips)).find((c) => c.id === id) as MediaClip;
const track = (tl: Timeline, id: string) => tl.sequences[0].tracks.find((t) => t.id === id)!;
const spans = (tl: Timeline, tid: string) => track(tl, tid).clips.map((c) => `${c.id}@${+c.start.toFixed(3)}-${+clipEnd(c).toFixed(3)}`).join(" ");

test("timecode in and out", () => {
  assert.equal(toTimecode(65.5, 30), "00:01:05:15");
  assert.equal(toTimecode(3600, 30), "01:00:00:00");
  assert.equal(parseTimecode("00:01:05:15", 30), 65.5);
  assert.equal(parseTimecode("1:05", 30), 65);
  assert.equal(parseTimecode("1:02.5", 30), 62.5);
  assert.equal(parseTimecode("90f", 30), 3);
  assert.equal(parseTimecode("+2s", 30, 10), 12);
  assert.equal(parseTimecode("-15f", 30, 10), 9.5);
  assert.equal(parseTimecode("105", 30, 0, true), 1 + 5 / 30);
  assert.equal(parseTimecode("nope", 30), null);
  assert.equal(parseTimecode("00:00:01:45", 30), null, "frames past the rate are refused");
});

test("three-point resolution", () => {
  assert.deepEqual(X.threePoint({ in: 2, out: 5 }, 20, {}, 7), { in: 2, out: 5, at: 7, len: 3 });
  assert.deepEqual(X.threePoint({ in: 2 }, 20, { in: 1, out: 3 }, 0), { in: 2, out: 4, at: 1, len: 2 });
  assert.deepEqual(X.threePoint({ out: 10 }, 20, { in: 1, out: 3 }, 0), { in: 8, out: 10, at: 1, len: 2 }, "backtimed source");
  assert.deepEqual(X.threePoint({ in: 2, out: 5 }, 20, { out: 9 }, 0), { in: 2, out: 5, at: 6, len: 3 }, "backtimed timeline");
});

test("insert pushes sync-locked tracks; overwrite doesn't", () => {
  const tl = fixture();
  const ins = ok(X.insert(tl, { media: "m3", in: 0, out: 2 }, 4));
  assert.equal(spans(ins, "v1"), "c1@0-4 c7@4-6 c2@6-10");
  assert.equal(spans(ins, "a1"), "c3@0-4 c8@4-6 c4@6-10");
  assert.equal(spans(ins, "a2"), "c5@0-4 c6@6-10", "music is split and pushed, keeping sync");
  assert.equal(clip(ins, "c7").link, clip(ins, "c8").link, "inserted picture and sound are linked");
  assert.ok(clip(ins, "c7").link);
  // with music sync lock off, the music isn't touched
  const tl2 = fixture(); track(tl2, "a2").syncLock = false;
  assert.equal(spans(ok(X.insert(tl2, { media: "m3", in: 0, out: 2 }, 4)), "a2"), "c5@0-8");
  const ow = ok(X.overwrite(tl, { media: "m3", in: 0, out: 2 }, 3));
  assert.equal(spans(ow, "v1"), "c1@0-3 c6@3-5 c2@5-8");
  assert.equal(clip(ow, "c2").in, 11, "overwritten head is trimmed from the source");
  assert.equal(spans(ow, "a2"), "c5@0-8");
  const ap = ok(X.append(tl, { media: "m3", in: 1, out: 3 }));
  assert.equal(spans(ap, "v1"), "c1@0-4 c2@4-8 c6@8-10");
});

test("targeting decides where source goes", () => {
  const tl = fixture();
  track(tl, "a1").targeted = false;
  track(tl, "a2").targeted = true;
  const r = ok(X.overwrite(tl, { media: "m3", in: 0, out: 1 }, 10));
  assert.equal(spans(r, "a2"), "c5@0-8 c7@10-11");
  track(tl, "a2").targeted = false;
  const r2 = ok(X.overwrite(tl, { media: "m3", in: 0, out: 1 }, 10));
  assert.equal(track(r2, "v1").clips.length, 3);
  assert.equal(clip(r2, "c6").link, undefined, "no audio target: picture only, unlinked");
});

test("replace keeps place and length", () => {
  const r = ok(X.replace(fixture(), "c2", { media: "m3", in: 5, out: 9 }));
  const c = clip(r, "c2");
  assert.deepEqual([c.media, c.start, c.in, c.out], ["m3", 4, 5, 9]);
  assert.equal(X.replace(fixture(), "c2", { media: "m3", in: 8, out: 9 }).ok, false, "too short");
});

test("lift leaves a gap, extract closes it on sync-locked tracks", () => {
  const tl = fixture();
  const l = ok(X.lift(tl, 2, 5));
  assert.equal(spans(l, "v1"), "c1@0-2 c2@5-8");
  assert.equal(spans(l, "a2"), "c5@0-8", "untargeted music untouched by lift");
  const e = ok(X.extract(tl, 2, 5));
  assert.equal(spans(e, "v1"), "c1@0-2 c2@2-5");
  assert.equal(spans(e, "a1"), "c3@0-2 c4@2-5");
  assert.equal(spans(e, "a2"), "c5@0-2 c6@2-5", "music loses the same 3 s and stays in sync");
});

test("ripple delete takes the linked sound with it", () => {
  const tl = fixture();
  track(tl, "a2").syncLock = false;
  const r = ok(X.rippleDelete(tl, ["c1"]));
  assert.equal(spans(r, "v1"), "c2@0-4");
  assert.equal(spans(r, "a1"), "c4@0-4");
  assert.equal(spans(r, "a2"), "c5@0-8");
  // music sync-locked with something under the hole: it stays, and we say so
  const r2 = X.rippleDelete(fixture(), ["c1"]);
  assert.ok(r2.ok);
  assert.match(r2.message || "", /Music/);
  // unlinked delete (Alt): only the picture
  const r3 = ok(X.remove(fixture(), ["c1"], false));
  assert.equal(spans(r3, "a1"), "c3@0-4 c4@4-8");
});

test("gaps", () => {
  let tl = ok(X.lift(fixture(), 4, 6));
  track(tl, "a2").syncLock = false;
  assert.deepEqual(X.gapAt(tl.sequences[0], "v1", 5), [4, 6]);
  const closed = ok(X.closeGap(tl, "v1", 5));
  assert.equal(spans(closed, "v1"), "c1@0-4 c2@4-6");
  assert.equal(spans(closed, "a1"), "c3@0-4 c4@4-6");
  track(tl, "a2").syncLock = true;
  assert.equal(X.closeGap(tl, "v1", 5).ok, false, "music under the gap blocks it");
  tl = fixture();
  clip(tl, "c2").start = 6; clip(tl, "c4").start = 6;
  const packed = ok(X.closeAllGaps(tl, "v1"));
  assert.equal(spans(packed, "v1"), "c1@0-4 c2@4-8");
  assert.equal(clip(packed, "c4").start, 4, "linked sound follows");
});

test("blade cuts every unlocked track", () => {
  const r = ok(X.blade(fixture(), 2));
  assert.equal(spans(r, "v1"), "c1@0-2 c6@2-4 c2@4-8");
  assert.equal(spans(r, "a2"), "c5@0-2 c8@2-8");
  assert.equal(clip(r, "c6").link, clip(r, "c7").link, "right halves form their own linked pair");
  assert.notEqual(clip(r, "c6").link, clip(r, "c1").link);
  const tl = fixture(); track(tl, "a2").locked = true;
  assert.equal(spans(ok(X.blade(tl, 2)), "a2"), "c5@0-8", "locked tracks aren't cut");
});

test("trim, ripple trim, J/L cut", () => {
  const t = ok(X.trim(fixture(), "c1", "end", -1));
  assert.equal(spans(t, "v1"), "c1@0-3 c2@4-8");
  assert.equal(spans(t, "a1"), "c3@0-3 c4@4-8", "linked sound trims too");
  assert.equal(X.trim(fixture(), "c4", "start", -1, false).ok, false, "a trim can't grow over its neighbour");
  const jl = ok(X.roll(fixture(), "c3", -1, false));
  assert.equal(spans(jl, "a1"), "c3@0-3 c4@3-8", "⌥ + Roll on the sound: it leads the picture (J cut)");
  assert.equal(spans(jl, "v1"), "c1@0-4 c2@4-8");
  assert.deepEqual(X.syncOffsets(jl.sequences[0]), {}, "still in sync: no offset badge");
  const tl = fixture(); track(tl, "a2").syncLock = false;
  const rt = ok(X.rippleTrim(tl, "c1", "end", -1));
  assert.equal(spans(rt, "v1"), "c1@0-3 c2@3-7");
  assert.equal(spans(rt, "a1"), "c3@0-3 c4@3-7");
  const rh = ok(X.rippleTrim(fixture(), "c2", "start", 1));
  assert.equal(spans(rh, "v1"), "c1@0-4 c2@4-7");
  assert.equal(clip(rh, "c2").in, 11);
  assert.equal(spans(rh, "a2"), "c5@0-4 c6@4-7", "sync-locked music loses the same second");
  const longer = ok(X.rippleTrim(fixture(), "c1", "end", 1));
  assert.equal(spans(longer, "v1"), "c1@0-5 c2@5-9");
  assert.equal(spans(longer, "a2"), "c5@0-4 c6@5-9", "music splits to make room and stays in sync");
});

test("roll, slip, slide, nudge", () => {
  const r = ok(X.roll(fixture(), "c1", 1));
  assert.equal(spans(r, "v1"), "c1@0-5 c2@5-8");
  assert.equal(clip(r, "c2").in, 11);
  assert.equal(spans(r, "a1"), "c3@0-5 c4@5-8");
  const s = ok(X.slip(fixture(), "c2", 2));
  assert.deepEqual([clip(s, "c2").start, clip(s, "c2").in, clip(s, "c2").out, clip(s, "c4").in], [4, 12, 16, 12]);
  assert.equal(clip(ok(X.slip(fixture(), "c2", 99)), "c2").out, 20, "slip stops at the end of the source");
  const tl = fixture();
  track(tl, "v1").clips.push({ id: "c9", media: "m3", start: 8, in: 1, out: 3, volume: 1, fadeIn: 0, fadeOut: 0, fit: "cover" } as Clip);
  tl.nextId = 10;
  const sl = ok(X.slide(tl, "c2", -1, false));
  assert.equal(spans(sl, "v1"), "c1@0-3 c2@3-7 c9@7-10");
  assert.equal(clip(sl, "c2").in, 10, "slide keeps the slid clip's content");
  assert.equal(clip(sl, "c9").in, 0, "next clip's head extends into its source");
  const n = ok(X.nudge(fixture(), ["c2"], 3));
  assert.equal(clip(n, "c2").start, 4.1);
  assert.equal(clip(n, "c4").start, 4.1);
});

test("link / unlink / sync offsets", () => {
  let tl = ok(X.unlink(fixture(), ["c1"]));
  assert.equal(clip(tl, "c1").link, undefined);
  assert.equal(clip(tl, "c3").link, undefined);
  tl = ok(X.link(tl, ["c1", "c3"]));
  assert.ok(clip(tl, "c1").link && clip(tl, "c1").link === clip(tl, "c3").link);
  const off = ok(X.slip(fixture(), "c4", 0.5, false));
  assert.deepEqual(X.syncOffsets(off.sequences[0]), { c4: -15 });
});

test("nest, flatten, cycles", () => {
  const r = X.nest(fixture(), ["c2"]);
  const tl = ok(r);
  const [nid, sid] = r.ids!;
  assert.equal(spans(tl, "v1"), `c1@0-4 ${nid}@4-8`);
  assert.equal(track(tl, "a1").clips.map((c) => c.id).join(), "c3", "linked sound went inside too");
  const child = tl.sequences.find((s) => s.id === sid)!;
  assert.equal(child.tracks.flatMap((t) => t.clips).map((c) => `${c.id}@${c.start}`).join(), "c2@0,c4@0");
  const flat = flatten(tl);
  const all = flat.tracks.flatMap((t) => t.clips.map((c) => ({ t: t.kind, c: c as MediaClip })));
  const pic = all.find((x) => x.c.id === `${nid}_c2`)!;
  assert.deepEqual([pic.t, pic.c.start, pic.c.in, pic.c.out, pic.c.volume], ["video", 4, 10, 14, 0], "picture plays at 4 s, silent (its linked sound plays)");
  const snd = all.find((x) => x.c.id === `${nid}_c4`)!;
  assert.deepEqual([snd.t, snd.c.start, snd.c.volume], ["audio", 4, 1]);
  // trimmed nested clip only plays its window
  const tr = structuredClone(tl);
  (clip(tr, nid) as any).in = 1;
  const f2 = flatten(tr).tracks.flatMap((t) => t.clips).find((c) => c.id === `${nid}_c2`) as MediaClip;
  assert.deepEqual([f2.start, f2.in, f2.out], [4, 11, 14]);
  // a sequence can't contain itself
  const cyc = structuredClone(tl);
  cyc.sequences.find((s) => s.id === sid)!.tracks[0].clips.push({ id: "c99", seq: "s1", start: 5, in: 0, out: 1, volume: 1, fadeIn: 0, fadeOut: 0 } as any);
  const v = validate(JSON.parse(JSON.stringify(cyc)));
  assert.ok(!v.ok && v.errors.some((e) => /contain themselves/.test(e)), v.errors.join("|"));
  assert.equal(X.deleteSequence(tl, sid).ok, false, "can't delete a sequence that's nested somewhere");
});

test("sequences: new, rename, duplicate as version", () => {
  let tl = ok(X.duplicateAsVersion(fixture()));
  assert.equal(tl.sequences[1].name, "Main v2");
  assert.equal(tl.activeSequence, tl.sequences[1].id);
  const ids = tl.sequences[1].tracks.flatMap((t) => t.clips.map((c) => c.id));
  assert.ok(ids.every((id) => Number(id.slice(1)) >= 6), "new ids");
  const v2 = tl.sequences[1].tracks.flatMap((t) => t.clips) as MediaClip[];
  assert.equal(v2.find((c) => c.media === "m1" && c.in === 0 && c.fit)!.link, v2.find((c) => c.media === "m1" && c.in === 0 && !c.fit)!.link, "links are kept, renamed");
  tl = ok(X.duplicateAsVersion(tl));
  assert.equal(tl.sequences[2].name, "Main v3");
  tl = ok(X.newSequence(tl, "Short", { width: 1080, height: 1920 }));
  tl = ok(X.renameSequence(tl, tl.activeSequence, "Shorts"));
  assert.equal(X.seqOf(tl).name, "Shorts");
});

test("markers and YouTube chapters", () => {
  let tl = fixture();
  for (const [t, name] of [[0, "Cold open"], [12, "Market"], [30, "Night"]] as const) tl = ok(X.addMarker(tl, { t, name, type: "chapter" }));
  tl = ok(X.addMarker(tl, { t: 3, name: "tighten", type: "claude", note: "cut the pause" }));
  tl = ok(X.addMarker(tl, { t: 11, name: "laugh" }, "c2")); // source time 11 → timeline 5
  const seq = tl.sequences[0];
  const all = X.allMarkers(seq);
  assert.deepEqual(all.map((k) => k.at), [0, 3, 5, 12, 30]);
  assert.equal(X.nextMarker(seq, 3, 1), 5);
  assert.equal(X.nextMarker(seq, 3, -1), 0);
  const ch = X.youtubeChapters(seq);
  assert.equal(ch.text, "0:00 Cold open\n0:12 Market\n0:30 Night");
  assert.ok(ch.warnings.some((w) => /Night/.test(w)), "last chapter shorter than 10 s is flagged (sequence is 8 s long)");
  const notes = X.claudeNotes(tl);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note, "cut the pause");
  const id = notes[0].id;
  tl = ok(X.updateMarker(tl, id, { done: true }));
  assert.equal(X.claudeNotes(tl).length, 0);
  tl = ok(X.deleteMarker(tl, id));
  assert.equal(X.allMarkers(tl.sequences[0]).length, 4);
  // markers ride along with ripple edits
  const ins = ok(X.insert(tl, { media: "m3", in: 0, out: 2 }, 1));
  assert.deepEqual(X.allMarkers(ins.sequences[0]).filter((k) => !k.clipId).map((k) => k.at), [0, 14, 32]);
  // marker ids share the counter and normalize keeps nextId past them
  const n = normalize(structuredClone(tl));
  assert.ok(n.nextId > Math.max(...X.allMarkers(n.sequences[0]).map((k) => Number(k.id.slice(1)))));
});

test("timeline marks, clipboard, paste attributes, match frame", () => {
  let tl = ok(X.setMarks(fixture(), { in: 1.01 }));
  assert.equal(tl.sequences[0].marks!.in, 1);
  tl = ok(X.setMarks(tl, null));
  assert.equal(tl.sequences[0].marks, undefined);
  const cb = X.copy(fixture(), ["c1"])!;
  assert.equal(cb.items.length, 2, "copies the linked sound too");
  const p = ok(X.paste(fixture(), cb, 8));
  assert.equal(spans(p, "v1"), "c1@0-4 c2@4-8 c6@8-12");
  assert.equal(clip(p, "c6").link, clip(p, "c7").link);
  assert.notEqual(clip(p, "c6").link, "L1");
  const pi = ok(X.paste(fixture(), cb, 4, "insert"));
  assert.equal(spans(pi, "v1"), "c1@0-4 c7@4-8 c2@8-12", "(c6 is the split-off music)");
  const src = fixture(); clip(src, "c1").volume = 0.5; clip(src, "c1").fadeIn = 0.5;
  const pa = ok(X.pasteAttributes(fixture(), X.copy(src, ["c1"])!, ["c2"], ["volume", "fades"]));
  assert.deepEqual([clip(pa, "c2").volume, clip(pa, "c2").fadeIn], [0.5, 0.5]);
  assert.deepEqual(X.matchFrame(fixture(), 5), { media: "m1", time: 11, clipId: "c2" });
  assert.equal(X.nextEditPoint(fixture().sequences[0], 1, 1), 4);
  assert.equal(X.nextEditPoint(fixture().sequences[0], 4, -1), 0);
  assert.deepEqual(X.clipsFrom(fixture().sequences[0], 4, "v1"), ["c2"]);
});

test("every edit round-trips through ops (so history/undo work)", () => {
  const tl = normalize(fixture());
  const results = [
    X.insert(tl, { media: "m3", in: 0, out: 2 }, 4), X.extract(tl, 1, 3), X.rippleTrim(tl, "c1", "end", -1),
    X.nest(tl, ["c2"]), X.addMarker(tl, { t: 2, name: "x" }), X.blade(tl, 2), X.duplicateAsVersion(tl),
  ];
  for (const r of results) {
    assert.ok(r.ok, r.message);
    const got = applyOps(tl, diff(tl, r.timeline));
    assert.deepEqual(normalize({ ...got, nextId: r.timeline.nextId }), normalize(r.timeline));
  }
});
