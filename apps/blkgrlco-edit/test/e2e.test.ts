// End to end against the real server (built bundle) and real ffmpeg:
// import by path, UI ops + a simultaneous Claude file edit, per-author undo over HTTP,
// broken-file handling, kill -9 and restart with nothing lost, and an export.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { diff } from "../shared/ops";
import type { Timeline, MediaClip } from "../shared/model";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5398;
const URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | false | undefined> | T | false | undefined, ms = 20000, what = "condition"): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v as T; await sleep(120); }
  throw new Error(`timed out waiting for ${what}`);
}
const j = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(URL + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const clipOf = (tl: Timeline, id: string) => tl.sequences.flatMap((s) => s.tracks.flatMap((t) => t.clips)).find((c) => c.id === id) as MediaClip;

test("Phase 1 round trip", { timeout: 240000 }, async (t) => {
  if (!fs.existsSync(path.join(appDir, "dist-server", "server.mjs")) || !fs.existsSync(path.join(appDir, "dist", "index.html")))
    execFileSync("npm", ["run", "build"], { cwd: appDir, stdio: "ignore" });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-e2e-"));
  const project = path.join(root, "proj");
  const footage = path.join(root, "drive", "project hhh", "mx"); // a path with spaces, like the T7
  fs.mkdirSync(footage, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:d=4:r=30", "-f", "lavfi", "-i", "sine=f=440:d=4", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(footage, "clip one.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=6", path.join(footage, "music.wav")]);
  fs.writeFileSync(path.join(footage, "notes.txt"), "not media");

  let srv: ChildProcess;
  const start = () => { srv = spawn("node", [path.join(appDir, "dist-server/server.mjs"), "--port", String(PORT), "--project", project], { stdio: "ignore" }); };
  start();
  t.after(() => srv.kill());
  await waitFor(async () => { try { return (await fetch(`${URL}/api/state`)).ok; } catch { return false; } }, 20000, "server");

  // --- import a folder by path: media is referenced where it is, never copied
  const imp = await j("POST", "/api/import", { paths: [path.join(root, "drive")], author: "you" });
  assert.equal(imp.status, 200);
  assert.deepEqual(imp.body.added, ["m1", "m2"]);
  let s = (await j("GET", "/api/state")).body;
  assert.equal(s.timeline.media.find((m: any) => m.name === "clip one.mp4").path, path.join(footage, "clip one.mp4"));
  assert.equal(fs.readdirSync(path.join(project, "media")).length, 0, "nothing copied into the project");

  // --- the UI adds two clips (as ops)
  const base: Timeline = s.timeline;
  const next = structuredClone(base);
  next.sequences[0].tracks[0].clips.push({ id: "c1", media: "m1", start: 0, in: 0, out: 2, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  next.sequences[0].tracks[0].clips.push({ id: "c2", media: "m1", start: 2, in: 2, out: 4, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  next.sequences[0].tracks[1].clips.push({ id: "c3", media: "m2", start: 0, in: 0, out: 4, volume: 0.5, fadeIn: 0, fadeOut: 0 });
  assert.equal((await j("POST", "/api/ops", { ops: diff(base, next), author: "you" })).status, 200);
  s = (await j("GET", "/api/state")).body;

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  await new Promise((r) => ws.on("open", r));

  // --- she drags c1 (op computed against the state she saw) while Claude edits c2 on disk
  const herBase: Timeline = s.timeline;
  const herNext = structuredClone(herBase);
  clipOf(herNext, "c1").start = 0.5;
  const herOps = diff(herBase, herNext);
  const file = path.join(project, "timeline.json");
  const disk = JSON.parse(fs.readFileSync(file, "utf8"));
  clipOf(disk, "c2").in = 2.5;
  fs.writeFileSync(file, JSON.stringify(disk, null, 2));
  const claudeMsg = await waitFor(() => msgs.find((m) => m.type === "change" && m.entry.author === "claude"), 10000, "Claude's change broadcast");
  assert.match(claudeMsg.entry.changes.map((c: any) => c.text).join(" "), /c2 trimmed: in 2s → 2.5s/);
  const hers = await j("POST", "/api/ops", { ops: herOps, author: "you" });
  assert.equal(hers.status, 200, "her edit merges with Claude's");
  s = (await j("GET", "/api/state")).body;
  assert.equal(clipOf(s.timeline, "c1").start, 0.5);
  assert.equal(clipOf(s.timeline, "c2").in, 2.5);

  // --- each undoes only their own
  assert.equal((await j("POST", "/api/undo", { author: "claude" })).status, 200);
  s = (await j("GET", "/api/state")).body;
  assert.equal(clipOf(s.timeline, "c2").in, 2);
  assert.equal(clipOf(s.timeline, "c1").start, 0.5);
  assert.equal((await j("POST", "/api/undo", { author: "you" })).status, 200);
  s = (await j("GET", "/api/state")).body;
  assert.equal(clipOf(s.timeline, "c1").start, 0);

  // --- a broken file: error broadcast, last good version kept
  msgs.length = 0;
  fs.writeFileSync(file, '{"version": 2, "sequences": [');
  const fe = await waitFor(() => msgs.find((m) => m.type === "file-error"), 10000, "file-error");
  assert.match(fe.message, /not valid JSON/);
  assert.equal(clipOf((await j("GET", "/api/state")).body.timeline, "c2").in, 2);

  // --- kill -9 while the file is broken; on restart it's restored from history
  srv!.kill("SIGKILL");
  await sleep(300);
  start();
  await waitFor(async () => { try { return (await fetch(`${URL}/api/state`)).ok; } catch { return false; } }, 20000, "restart");
  s = (await j("GET", "/api/state")).body;
  assert.ok(s.bootNotes.some((n: string) => n.includes("damaged")), s.bootNotes.join("|"));
  assert.equal(clipOf(s.timeline, "c2").in, 2);
  assert.ok(fs.readdirSync(project).some((f) => f.startsWith("timeline.json.broken-")));
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).version, 2);
  // history survived: Claude's redo is still available after the restart
  assert.equal((await j("POST", "/api/redo", { author: "claude" })).status, 200);
  assert.equal(clipOf((await j("GET", "/api/state")).body.timeline, "c2").in, 2.5);

  // --- export reads the originals from their own folder
  const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const m2: any[] = [];
  ws2.on("message", (d) => m2.push(JSON.parse(String(d))));
  await new Promise((r) => ws2.on("open", r));
  assert.equal((await j("POST", "/api/export")).status, 200);
  const done = await waitFor(() => m2.find((m) => m.type === "export" && m.state !== "running"), 120000, "export");
  assert.equal(done.state, "done", done.error);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path.join(project, "exports", done.file)]).toString());
  assert.equal(probe.streams.find((x: any) => x.codec_type === "video").height, 1920);
  assert.ok(Math.abs(Number(probe.format.duration) - 4) < 0.15);
  ws.close(); ws2.close();
});
