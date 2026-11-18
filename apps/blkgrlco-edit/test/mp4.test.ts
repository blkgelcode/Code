// The demuxer must agree with ffprobe, packet by packet, on the files the app actually meets.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openMovie, indexFrames, frameAt, type ReadRange } from "../src/engine/mp4";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-mp4-"));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const reader = (file: string): { read: ReadRange; size: number; reads: number[] } => {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const reads: number[] = [];
  return {
    size, reads,
    read: async (s, e) => { reads.push(e - s); const b = Buffer.alloc(e - s); fs.readSync(fd, b, 0, e - s, s); return new Uint8Array(b); },
  };
};
function ffprobePackets(file: string) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_entries", "packet=pts_time,dts_time,pos,size,flags", "-of", "json", file]).toString());
  return out.packets.map((p: any) => ({ pts: Number(p.pts_time), dts: Number(p.dts_time), pos: Number(p.pos), size: Number(p.size), key: p.flags.startsWith("K") }));
}

const fixtures: Record<string, string[]> = {
  // a proxy: H.264 with B-frames, faststart (moov first), 1 s GOP, AAC interleaved
  "proxy.mp4": ["-f", "lavfi", "-i", "testsrc2=s=960x540:d=3:r=30", "-f", "lavfi", "-i", "sine=d=3", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"],
  // a camera-style original: 10-bit HEVC, moov at the END
  "dji.mp4": ["-f", "lavfi", "-i", "testsrc2=s=1920x1080:d=2:r=60", "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=none", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1"],
  // a phone-style MOV
  "iphone.mov": ["-f", "lavfi", "-i", "testsrc2=s=1280x720:d=2:r=30", "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-f", "mov"],
};

for (const [name, args] of Object.entries(fixtures)) {
  test(`demuxer matches ffprobe: ${name}`, async () => {
    const file = path.join(dir, name);
    ff(...args, file);
    const r = reader(file);
    const movie = await openMovie(r.read, r.size);
    const v = movie.video!;
    const want = ffprobePackets(file);
    assert.equal(v.samples.length, want.length, "frame count");
    // ffprobe lists packets in decode order, like our samples
    for (let i = 0; i < want.length; i++) {
      const s = v.samples[i], w = want[i];
      assert.equal(s.offset, w.pos, `frame ${i} offset`);
      assert.equal(s.size, w.size, `frame ${i} size`);
      assert.equal(s.sync, w.key, `frame ${i} keyframe`);
      assert.ok(Math.abs(s.cts - v.editStart - w.pts) < 1e-6, `frame ${i} pts ${s.cts - v.editStart} vs ${w.pts}`);
    }
    // never reads the whole file to find moov: headers + moov only
    const readBytes = r.reads.reduce((a, b) => a + b, 0);
    assert.ok(readBytes < r.size / 4 || r.size < 400000, `read ${readBytes} of ${r.size} bytes`);
    // 10-bit HEVC = Main 10 (profile 2); H.264 high (64) or main (4d) + constraint + level bytes
    if (name === "dji.mp4") assert.match(v.codec, /^hvc1\.2\.4\.L\d+(\.[0-9A-F]+)*$/, v.codec);
    else assert.match(v.codec, /^avc1\.(64|4d)[0-9a-f]{4}$/, v.codec);
    assert.ok(v.description && v.description.length > 10, "has avcC/hvcC");
    if (name === "proxy.mp4") assert.equal(movie.audio!.codec, "mp4a.40.2");
  });
}

test("frameAt picks the frame on screen at any time", async () => {
  const file = path.join(dir, "fa.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=s=320x240:d=2:r=30", "-c:v", "libx264", "-preset", "veryfast", "-g", "30", "-pix_fmt", "yuv420p", file);
  const r = reader(file);
  const ix = indexFrames((await openMovie(r.read, r.size)).video!);
  assert.equal(ix.pres.length, 60);
  assert.equal(frameAt(ix, 0), 0);
  assert.equal(frameAt(ix, 1 / 30 - 0.001), 0);
  assert.equal(frameAt(ix, 1 / 30), 1);
  assert.equal(frameAt(ix, 1.0), 30);
  assert.equal(frameAt(ix, 99), 59);
  // the keyframe needed for frame 45 is frame 30's GOP start
  const di = ix.pres[45].di;
  assert.equal(ix.pres.find((p) => p.di === ix.gopStart[di])!.cts, 1);
});
