import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs } from "../server/export.js";
import { defaultTimeline, normalize, seqOf } from "../src/lib/model.js";

test("export graph stacks tracks bottom-up, mixes audio and skips hidden/muted", () => {
  const tl = defaultTimeline();
  tl.media.push({ id: "m1", file: "a.mp4", kind: "video", duration: 10, hasAudio: true });
  const tr = (id) => seqOf(tl).tracks.find((t) => t.id === id);
  tr("v1").clips.push({ id: "c1", media: "m1", start: 1, in: 2, out: 5, fadeIn: 0.5, link: "L1" });
  tr("a1").clips.push({ id: "c1a", media: "m1", start: 1, in: 2, out: 5, fadeIn: 0.5, link: "L1" });
  tr("t1").clips.push({ id: "c2", start: 0, duration: 2, text: "hi" });
  const args = buildFfmpegArgs(normalize(tl).timeline, "/tmp/x.mp4");
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.ok(args.includes("-ss") && args[args.indexOf("-ss") + 1] === "2");
  assert.ok(graph.indexOf("overlay") < graph.indexOf("drawtext"), "text track is above the video track, so drawn after");
  assert.match(graph, /fade=t=in:st=0:d=0.5:alpha=1/);
  assert.match(graph, /adelay=1000:all=1/);
  assert.equal(args[args.indexOf("-t", args.indexOf("-filter_complex")) + 1], "4");

  tr("a1").muted = true;
  tr("t1").hidden = true;
  const g2 = (a) => a[a.indexOf("-filter_complex") + 1];
  const muted = g2(buildFfmpegArgs(normalize(tl).timeline, "/tmp/x.mp4"));
  assert.ok(!muted.includes("drawtext") && muted.includes("anullsrc"));
});

test("export refuses an empty timeline", () => {
  assert.throws(() => buildFfmpegArgs(defaultTimeline(), "/tmp/x.mp4"), /empty/);
});

test("D-Log M media get the conversion LUT, then the channel's look; per-clip switches turn them off", async () => {
  const { DLOGM_LUT, EVERYDAY_LUT } = await import("../server/brand.js");
  const tl = defaultTimeline();
  tl.project.channel = "@blkgrlco";
  tl.media.push({ id: "m1", file: "DJI_20261011101233_0001_D.MP4", kind: "video", duration: 10, hasAudio: false, logProfile: "dlogm" });
  seqOf(tl).tracks.find((t) => t.id === "v1").clips.push({ id: "c1", media: "m1", start: 0, in: 0, out: 2 });
  const graph = (t) => { const a = buildFfmpegArgs(normalize(t).timeline, "/tmp/x.mp4"); return a[a.indexOf("-filter_complex") + 1]; };
  const g = graph(tl);
  assert.ok(g.indexOf(DLOGM_LUT) > 0 && g.indexOf(EVERYDAY_LUT) > g.indexOf(DLOGM_LUT), "conversion first, then the look");
  seqOf(tl).tracks.find((t) => t.id === "v1").clips[0].color = { input: "none", look: "none" };
  assert.ok(!graph(tl).includes("lut3d"));
});
