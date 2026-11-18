import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs } from "../server/export.js";
import { defaultTimeline, normalize } from "../src/lib/model.js";

test("export graph stacks tracks bottom-up, mixes audio and skips hidden/muted", () => {
  const tl = defaultTimeline();
  tl.media.push({ id: "m1", file: "a.mp4", kind: "video", duration: 10, hasAudio: true });
  tl.tracks.find((t) => t.id === "v1").clips.push({ id: "c1", media: "m1", start: 1, in: 2, out: 5, fadeIn: 0.5 });
  tl.tracks.find((t) => t.id === "t1").clips.push({ id: "c2", start: 0, duration: 2, text: "hi" });
  const args = buildFfmpegArgs(normalize(tl).timeline, "/tmp/x.mp4");
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.ok(args.includes("-ss") && args[args.indexOf("-ss") + 1] === "2");
  assert.ok(graph.indexOf("overlay") < graph.indexOf("drawtext"), "text track is above the video track, so drawn after");
  assert.match(graph, /fade=t=in:st=0:d=0.5:alpha=1/);
  assert.match(graph, /adelay=1000:all=1/);
  assert.equal(args[args.indexOf("-t", args.indexOf("-filter_complex")) + 1], "4");

  tl.tracks.find((t) => t.id === "v1").muted = true;
  tl.tracks.find((t) => t.id === "t1").hidden = true;
  const g2 = (a) => a[a.indexOf("-filter_complex") + 1];
  const muted = g2(buildFfmpegArgs(normalize(tl).timeline, "/tmp/x.mp4"));
  assert.ok(!muted.includes("drawtext") && muted.includes("anullsrc"));
});

test("export refuses an empty timeline", () => {
  assert.throws(() => buildFfmpegArgs(defaultTimeline(), "/tmp/x.mp4"), /empty/);
});
