// End to end: a real server on a temp project, real ffmpeg. Covers import, browser-style
// edits, an external (Claude) edit pushed over WebSocket, a broken file, and export.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5399;
const URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 20000, what = "condition") {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("full round trip", { timeout: 180000 }, async (t) => {
  if (!fs.existsSync(path.join(appDir, "dist", "index.html"))) execFileSync("npx", ["vite", "build"], { cwd: appDir });
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-"));
  const media = path.join(project, "media");
  fs.mkdirSync(media);
  // A 4 s portrait clip with a tone, a 6 s music bed, and a still.
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=720x1280:d=4:r=30", "-f", "lavfi", "-i", "sine=f=440:d=4", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(media, "clip.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=6", path.join(media, "music.wav")]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0xEBB9BA:s=800x600:d=1", "-frames:v", "1", path.join(media, "still.png")]);

  const srv = spawn("node", [path.join(appDir, "server/index.js"), "--port", String(PORT), "--project", project], { stdio: ["ignore", "pipe", "pipe"] });
  let srvLog = "";
  srv.stdout.on("data", (d) => (srvLog += d));
  srv.stderr.on("data", (d) => (srvLog += d));
  t.after(() => srv.kill());

  const state = async () => (await fetch(`${URL}/api/state`)).json();
  const s0 = await waitFor(async () => { try { const s = await state(); return s.timeline.media.length === 3 && s; } catch { return false; } }, 30000, "media import");
  const byFile = Object.fromEntries(s0.timeline.media.map((m) => [m.file, m]));
  assert.equal(byFile["clip.mp4"].duration, 4);
  assert.equal(byFile["clip.mp4"].width, 720);
  assert.equal(byFile["clip.mp4"].hasAudio, true);
  assert.equal(byFile["still.png"].type, "image");

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = [];
  ws.on("message", (d) => msgs.push(JSON.parse(d)));
  await new Promise((r) => ws.on("open", r));
  t.after(() => ws.close());

  // --- a browser-style edit (PUT)
  const tl = structuredClone(s0.timeline);
  const vid = byFile["clip.mp4"].id;
  tl.tracks[0].clips.push({ id: "c1", media: vid, start: 0, in: 0, out: 4, volume: 1, fit: "cover" });
  tl.tracks[0].clips.push({ id: "c2", media: byFile["still.png"].id, start: 4, in: 0, out: 2, fit: "contain", fadeOut: 0.5 });
  tl.tracks[1].clips.push({ id: "c3", media: byFile["music.wav"].id, start: 0, in: 0, out: 6, volume: 0.3, fadeOut: 1 });
  tl.nextId = 4;
  let r = await fetch(`${URL}/api/timeline`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeline: tl, baseRevision: s0.revision }) });
  assert.equal(r.status, 200);
  const rev1 = (await r.json()).revision;
  const onDisk = JSON.parse(fs.readFileSync(path.join(project, "timeline.json"), "utf8"));
  assert.equal(onDisk.tracks[0].clips.length, 2, "browser edits land in timeline.json");

  // stale revision → 409
  r = await fetch(`${URL}/api/timeline`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeline: tl, baseRevision: rev1 - 1 }) });
  assert.equal(r.status, 409);

  // --- an external edit, the way Claude Code would make it: cut the first 1 s of c1, add a title
  const ext = JSON.parse(fs.readFileSync(path.join(project, "timeline.json"), "utf8"));
  const c1 = ext.tracks[0].clips.find((c) => c.id === "c1");
  c1.in = 1;
  ext.tracks[0].clips.find((c) => c.id === "c2").start = 3;
  ext.tracks[2].clips.push({ id: "c4", start: 0.5, duration: 2, text: "day 21", style: { size: 110, color: "#A8B118", x: 0.5, y: 0.15 } });
  ext.nextId = 5;
  msgs.length = 0;
  fs.writeFileSync(path.join(project, "timeline.json"), JSON.stringify(ext, null, 2));
  const pushed = await waitFor(() => msgs.find((m) => m.type === "timeline" && m.author === "claude"), 10000, "WebSocket push of the external edit");
  const texts = pushed.entry.changes.map((c) => c.text);
  assert.ok(texts.some((x) => x.startsWith("trimmed c1: in 0s → 1s")), texts.join(" | "));
  assert.ok(texts.some((x) => x.includes('added c4 ("day 21")')), texts.join(" | "));
  const act = fs.readFileSync(path.join(project, "activity.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(act.map((a) => a.author).filter((a) => a !== "app"), ["you", "claude"]);

  // --- a broken file keeps the last good version and reports the error
  msgs.length = 0;
  fs.writeFileSync(path.join(project, "timeline.json"), "{ not json");
  await waitFor(() => msgs.find((m) => m.type === "file-error"), 10000, "file-error push");
  assert.equal((await state()).timeline.tracks[2].clips[0].text, "day 21");
  fs.writeFileSync(path.join(project, "timeline.json"), JSON.stringify(ext, null, 2));
  await waitFor(() => msgs.find((m) => m.type === "timeline"), 10000, "recovery");

  // --- proxies and thumbnails get made
  const proxy = await fetch(`${URL}/api/play/${vid}`);
  assert.equal(proxy.status, 200);
  assert.equal((await fetch(`${URL}/api/thumb/${vid}`)).status, 200);
  assert.equal((await fetch(`${URL}/api/wave/${byFile["music.wav"].id}`)).status, 200);

  // --- export
  msgs.length = 0;
  r = await fetch(`${URL}/api/export`, { method: "POST" });
  assert.equal(r.status, 200);
  const done = await waitFor(() => msgs.find((m) => m.type === "export" && (m.state === "done" || m.state === "error")), 120000, "export");
  assert.equal(done.state, "done", done.error);
  const out = path.join(project, "exports", done.file);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", out]));
  const v = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  assert.ok(probe.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Math.abs(Number(probe.format.duration) - 6) < 0.15, `duration ${probe.format.duration}`);

  // the title is drawn in olive at the top during 0.5–2.5 s and gone at 4 s
  const px = (tSec, y) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(tSec), "-i", out, "-frames:v", "1", "-vf", `crop=1080:200:0:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const frame = execFileSync("ffmpeg", ["-v", "error", "-ss", "1.5", "-i", out, "-frames:v", "1", "-vf", "crop=1080:240:0:168", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  let olive = 0;
  for (let i = 0; i < frame.length; i += 3) if (Math.abs(frame[i] - 168) < 30 && Math.abs(frame[i + 1] - 177) < 30 && frame[i + 2] < 70) olive++;
  assert.ok(olive > 500, `expected olive title pixels, got ${olive}`);
  // at 4.5 s the still (blush, letterboxed with "contain") is showing
  const mid = px(4.5, 860);
  assert.ok(mid[0] > 200 && mid[1] > 150, `expected the blush still at 4.5 s, got ${[...mid]}`);
  void srvLog;
});
