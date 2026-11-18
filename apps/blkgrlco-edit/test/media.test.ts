// Phase 2: the import & media engine, end to end against the built server and real ffmpeg.
// Footage lives on a simulated external drive (a folder with a volume UUID, like the T7).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5397;
const URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const probe = (f: string, ...a: string[]) => execFileSync("ffprobe", ["-v", "error", ...a, f]).toString().trim();
const j = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(URL + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
async function waitFor<T>(fn: () => Promise<T | false | undefined | null>, ms: number, what: string): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(250); }
  throw new Error(`timed out: ${what}`);
}
const idle = () => waitFor(async () => { const q = (await j("GET", "/api/media/status")).body.queue; return q.running + q.queued === 0 && q; }, 180000, "queue to finish");

test("Phase 2: import & media engine", { timeout: 600000 }, async (t) => {
  if (!fs.existsSync(path.join(appDir, "dist-server", "server.mjs"))) execFileSync("npm", ["run", "build"], { cwd: appDir, stdio: "ignore" });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-media-"));
  const volumes = path.join(root, "Volumes");
  const drive = path.join(volumes, "Untitled");
  const mx = path.join(drive, "project hhh", "mx");
  fs.mkdirSync(path.join(mx, "day2"), { recursive: true });
  fs.writeFileSync(path.join(drive, ".volume-uuid"), "T7-TEST-UUID");
  const project = path.join(root, "proj");

  // --- fixtures: what DJI, iPhone and phones actually produce
  ff("-f", "lavfi", "-i", "testsrc2=s=3840x2160:d=3:r=60", "-f", "lavfi", "-i", "sine=f=300:d=3", "-shortest", "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=none", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-c:a", "aac", "-metadata:s:v", "handler_name=DJI.AVC", path.join(mx, "day2", "DJI_0245_D.MP4"));
  const tmp = path.join(root, "t.mov");
  ff("-f", "lavfi", "-i", "testsrc2=s=1920x1080:d=2:r=30", "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=none", "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-tag:v", "hvc1", tmp);
  ff("-display_rotation:v:0", "90", "-i", tmp, "-c", "copy", path.join(mx, "IMG_4555.MOV"));
  ff("-f", "lavfi", "-i", "testsrc2=s=1280x720:d=3:r=30", "-vf", "setpts='N/30/TB+if(gt(N,45),(N-45)*0.02/TB,0)'", "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(mx, "IMG_4560.MOV"));
  ff("-f", "lavfi", "-i", "sine=f=220:d=4", path.join(mx, "music.wav"));
  ff("-f", "lavfi", "-i", "color=c=0xEBB9BA:s=4000x3000", "-frames:v", "1", path.join(mx, "photo.jpg"));
  fs.writeFileSync(path.join(mx, "corrupt.mp4"), fs.readFileSync(path.join(mx, "day2", "DJI_0245_D.MP4")).subarray(0, 200000));
  fs.writeFileSync(path.join(mx, "notes.txt"), "not media");
  fs.mkdirSync(path.join(mx, "batch"));
  const small = path.join(root, "small.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=s=320x568:d=1:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", small);
  for (let i = 0; i < 24; i++) { const f = path.join(mx, "batch", `clip_${String(i).padStart(2, "0")}.mp4`); fs.copyFileSync(small, f); fs.appendFileSync(f, Buffer.from([i])); } // distinct files

  let srv: ChildProcess;
  const start = () => { srv = spawn("node", [path.join(appDir, "dist-server/server.mjs"), "--port", String(PORT), "--project", project], { stdio: "ignore", env: { ...process.env, BLKEDIT_VOLUMES_ROOT: volumes } }); };
  const up = () => waitFor(async () => { try { return (await fetch(`${URL}/api/state`)).ok; } catch { return false; } }, 20000, "server");
  start();
  t.after(() => srv.kill());
  await up();

  // --- import a whole folder by path: fast, nothing copied, bad files reported not fatal
  const t0 = Date.now();
  const imp = await j("POST", "/api/import", { paths: [path.join(drive, "project hhh")] });
  const importMs = Date.now() - t0;
  assert.equal(imp.status, 200);
  assert.equal(imp.body.added.length, 29, JSON.stringify(imp.body));
  assert.equal(imp.body.failed.length, 1);
  assert.match(imp.body.failed[0].error, /moov atom not found/);
  assert.ok(importMs < 8000, `import took ${importMs} ms`);
  let s = (await j("GET", "/api/state")).body;
  const by = (name: string) => s.timeline.media.find((m: any) => m.name === name);
  assert.deepEqual(s.timeline.media.slice(0, 3).map((m: any) => m.id), ["m1", "m2", "m3"], "ids in folder order");
  const dji = by("DJI_0245_D.MP4"), iph = by("IMG_4555.MOV"), vfr = by("IMG_4560.MOV");
  assert.deepEqual([dji.width, dji.height, dji.fps, dji.codec, dji.bitDepth, dji.camera], [3840, 2160, 60, "hevc", 10, "DJI"]);
  assert.deepEqual([iph.width, iph.height, iph.hdr, iph.rotation, iph.bitDepth], [1080, 1920, "hlg", 90, 10]);
  assert.equal(vfr.vfr, true);
  assert.deepEqual(dji.volume, { uuid: "T7-TEST-UUID", name: "Untitled", rel: "project hhh/mx/day2/DJI_0245_D.MP4" });
  assert.ok(!fs.existsSync(path.join(project, "media", "DJI_0245_D.MP4")), "nothing copied");

  // --- background queue: never more than 2 jobs; everything ends ready
  const q = await idle();
  assert.equal(q.maxConcurrent, 2, "ran 2 at a time, not more");
  s = (await j("GET", "/api/state")).body;
  for (const m of s.timeline.media) {
    const st = s.mediaStatus[m.id];
    for (const k of ["thumb", "proxy", "strip", "wave", "still"]) assert.ok(["ready", "n/a"].includes(st[k].state), `${m.name} ${k}: ${JSON.stringify(st[k])}`);
  }

  // --- proxy spec: 960×540 / 540×960, H.264 8-bit, keyframe every 1 s, tagged SDR
  const proxyOf = (m: any) => path.join(project, ".cache", "proxies", `${m.fingerprint}.mp4`);
  const spec = (m: any) => probe(proxyOf(m), "-select_streams", "v", "-show_entries", "stream=codec_name,width,height,pix_fmt,color_transfer", "-of", "csv=p=0");
  assert.equal(spec(dji), "h264,960,540,yuv420p,bt709");
  assert.equal(spec(iph), "h264,540,960,yuv420p,bt709", "rotated + HDR tone-mapped to SDR");
  // the HDR clip is really tone-mapped (not just relabelled): brighter/flatter than a naive conversion
  const luma = (f: string) => { const b = execFileSync("ffmpeg", ["-v", "error", "-i", f, "-frames:v", "1", "-vf", "scale=64:-2,format=gray", "-f", "rawvideo", "-"]); return b.reduce((a, x) => a + x, 0) / b.length; };
  const naive = luma(path.join(mx, "IMG_4555.MOV")), mapped = luma(proxyOf(iph));
  assert.ok(Math.abs(naive - mapped) > 5, `HDR proxy brightness ${mapped.toFixed(1)} vs naive ${naive.toFixed(1)}`);
  const keys = probe(proxyOf(dji), "-select_streams", "v", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0").split("\n").map((x) => parseFloat(x));
  assert.deepEqual(keys.map((k) => Math.round(k * 100) / 100), [0, 1, 2]);

  // --- range-request streaming (seek without downloading the file)
  const rr = await fetch(`${URL}/api/media/${dji.id}/proxy`, { headers: { Range: "bytes=100-1123" } });
  assert.equal(rr.status, 206);
  assert.equal((await rr.arrayBuffer()).byteLength, 1024);
  const ro = await fetch(`${URL}/api/media/${dji.id}/original`, { headers: { Range: "bytes=0-99" } });
  assert.equal(ro.status, 206);
  // full-quality frame straight from the 4K original
  const fr = Buffer.from(await (await fetch(`${URL}/api/media/${dji.id}/frame?t=1.5&w=3840`)).arrayBuffer());
  const sof = fr.indexOf(Buffer.from([0xff, 0xc0]));
  assert.deepEqual([fr.readUInt16BE(sof + 7), fr.readUInt16BE(sof + 5)], [3840, 2160]);

  // --- cache: a restart re-processes nothing
  srv!.kill();
  await sleep(500);
  start();
  await up();
  await sleep(1500);
  let q2 = (await j("GET", "/api/media/status")).body.queue;
  assert.equal(q2.jobsRun, 0, "nothing reprocessed after restart");

  // --- one bad file fails alone; Retry fixes it once the file is good again
  const target = path.join(mx, "batch", "clip_03.mp4");
  const good = fs.readFileSync(target);
  const ids = (await j("GET", "/api/state")).body.timeline.media;
  const c3 = ids.find((m: any) => m.path === target);
  fs.rmSync(path.join(project, ".cache", "proxies", `${c3.fingerprint}.mp4`));
  fs.writeFileSync(target, Buffer.alloc(good.length, 7)); // garbage, same size
  await j("POST", `/api/media/${c3.id}/retry`);
  const failed = await waitFor(async () => { const st = (await j("GET", "/api/media/status")).body.statuses[c3.id]; return st.proxy.state === "error" && st; }, 30000, "proxy error");
  assert.ok(failed.online, "a bad file is an error, not offline");
  const others = (await j("GET", "/api/media/status")).body.statuses;
  assert.equal(Object.values(others).filter((x: any) => x.proxy.state === "error").length, 1, "only that clip failed");
  fs.writeFileSync(target, good);
  await j("POST", `/api/media/${c3.id}/retry`);
  await waitFor(async () => (await j("GET", "/api/media/status")).body.statuses[c3.id].proxy.state === "ready", 30000, "retry → ready");

  // --- put clips on the timeline, then unplug the drive
  s = (await j("GET", "/api/state")).body;
  const tl = structuredClone(s.timeline);
  tl.sequences[0].tracks[0].clips.push({ id: "c1", media: dji.id, start: 0, in: 0, out: 2, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  tl.sequences[0].tracks[0].clips.push({ id: "c2", media: iph.id, start: 2, in: 0, out: 1, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 });
  const { diff } = await import("../shared/ops");
  assert.equal((await j("POST", "/api/ops", { ops: diff(s.timeline, tl) })).status, 200);
  fs.renameSync(drive, path.join(root, "unplugged"));
  await waitFor(async () => (await j("GET", "/api/media/status")).body.statuses[dji.id].online === false, 8000, "offline");
  // proxies still stream while the drive is out; the original doesn't; export refuses
  assert.equal((await fetch(`${URL}/api/media/${dji.id}/proxy`)).status, 200);
  assert.equal((await fetch(`${URL}/api/media/${dji.id}/original`)).status, 410);
  const ex = await j("POST", "/api/export");
  assert.equal(ex.status, 409);
  assert.match(ex.body.error, /offline/);

  // --- plug it back in under a different name: reconnects by itself
  fs.renameSync(path.join(root, "unplugged"), path.join(volumes, "Untitled 1"));
  await waitFor(async () => (await j("GET", "/api/media/status")).body.statuses[dji.id].online === true, 8000, "back online");
  s = (await j("GET", "/api/state")).body;
  assert.equal(s.timeline.media.find((m: any) => m.id === dji.id).path, path.join(volumes, "Untitled 1", "project hhh", "mx", "day2", "DJI_0245_D.MP4"));
  assert.equal(s.history.at(-1).author, "app");
  assert.match(s.history.at(-1).changes[0].text, /reconnected/);

  // --- manual relink checks it's the same footage
  const copy = path.join(root, "copy of DJI.MP4");
  fs.copyFileSync(s.timeline.media.find((m: any) => m.id === dji.id).path, copy);
  assert.equal((await j("POST", `/api/media/${dji.id}/relink`, { path: path.join(volumes, "Untitled 1", "project hhh", "mx", "music.wav") })).status, 409);
  assert.equal((await j("POST", `/api/media/${dji.id}/relink`, { path: copy })).status, 200);

  // --- export reads the 4K 10-bit HEVC original and writes SDR H.264
  const ws = new (await import("ws")).default(`ws://127.0.0.1:${PORT}/ws`);
  const msgs: any[] = [];
  ws.on("message", (d: Buffer) => msgs.push(JSON.parse(String(d))));
  await new Promise((r) => ws.on("open", r));
  assert.equal((await j("POST", "/api/export")).status, 200);
  const done = await waitFor(async () => msgs.find((m) => m.type === "export" && m.state !== "running"), 180000, "export");
  assert.equal(done.state, "done", done.error);
  const out = path.join(project, "exports", done.file);
  assert.equal(probe(out, "-select_streams", "v", "-show_entries", "stream=codec_name,width,height,color_transfer", "-of", "csv=p=0"), "h264,1080,1920,bt709");
  ws.close();
});
