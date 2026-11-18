import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { storedPath, needs, kindOf } from "../server/media.js";
import { MEDIA_DIR } from "../server/store.js";

test("files inside media/ are stored relative, anything else by absolute path", () => {
  assert.equal(storedPath(path.join(MEDIA_DIR, "sub", "a.mp4")), "sub/a.mp4");
  assert.equal(storedPath("/Volumes/T7/a.mp4"), "/Volumes/T7/a.mp4");
});

test("which background jobs each kind of file needs", () => {
  assert.deepEqual(needs({ kind: "video", hasAudio: true }, "/x/a.MOV"), { thumb: true, wave: true, proxy: true });
  assert.deepEqual(needs({ kind: "video", hasAudio: false }, "/x/a.mp4"), { thumb: true, wave: false, proxy: true });
  assert.deepEqual(needs({ kind: "audio" }, "/x/a.mp3"), { thumb: false, wave: true, proxy: false });
  assert.deepEqual(needs({ kind: "audio" }, "/x/a.aif"), { thumb: false, wave: true, proxy: true });
  assert.equal(kindOf("DJI_0001.MP4"), "video");
  assert.equal(kindOf("notes.txt"), null);
});
