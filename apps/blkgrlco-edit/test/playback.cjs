// Phase 3 playback engine, tested inside the real Mac app (Electron):
//   frame-exact display at any time, scrub latency, smooth 1× playback, J/K/L shuttle incl.
//   reverse, frame stepping, source monitor In/Out → timeline, audio meters, export queue.
// The test footage encodes its frame number in its brightness, so reading a pixel tells us
// exactly which frame the viewer is showing.
// Run: npm run test:playback   (Linux needs xvfb-run; macOS runs it directly)
const { _electron } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const APP = path.resolve(__dirname, "..");
const S = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-playback-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); };

// frame n is grey with luma 24 + (n mod 24)*8: 24 levels, all inside video range (no clipping
// at black or white), far enough apart for H.264 to keep them distinct
const FPS = 30;
fs.mkdirSync(path.join(S, "footage"));
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `nullsrc=s=1920x1080:r=${FPS}:d=6,geq=lum='24+mod(N,24)*8':cb=128:cr=128`,
  "-f", "lavfi", "-i", "sine=f=440:d=6:sample_rate=48000", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(S, "footage", "frames.mp4")]);

(async () => {
  const app = await _electron.launch({
    executablePath: path.join(APP, "node_modules/electron/dist/electron"),
    args: [APP, ...(process.platform === "linux" ? ["--no-sandbox"] : []), "--autoplay-policy=no-user-gesture-required", "--project", path.join(S, "proj")],
    env: { ...process.env, PORT: "5321" },
  });
  const win = await app.firstWindow();
  const U = "http://127.0.0.1:5321";
  await win.waitForSelector(".topbar", { timeout: 30000 });
  const post = (p, b) => win.evaluate(async ([p, b]) => { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }); return { status: r.status, body: await r.json() }; }, [p, b]);
  const get = (p) => win.evaluate(async (p) => (await fetch(p)).json(), p);

  // import + wait for the proxy
  await post("/api/import", { paths: [path.join(S, "footage")] });
  for (let i = 0; i < 120; i++) { const q = (await get("/api/media/status")).queue; if (q.running + q.queued === 0) break; await sleep(500); }
  let st = await get("/api/state");
  const m = st.timeline.media[0];
  check(st.mediaStatus[m.id].proxy.state === "ready", "proxy made");

  // two clips: 0–4 s of the file at 0:00, then 1–3 s at 0:04 (a cut to a different frame)
  await win.locator(".media-bin li").first().dblclick(); await sleep(600);
  st = await get("/api/state");
  const tl = st.timeline;
  const v1 = tl.sequences[0].tracks.find((t) => t.kind === "video");
  v1.clips = [{ id: "c1", media: m.id, start: 0, in: 0, out: 4, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 },
              { id: "c2", media: m.id, start: 4, in: 1, out: 3, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 }];
  tl.sequences[0].tracks.find((t) => t.kind === "audio").clips = [];
  tl.nextId = 3;
  fs.writeFileSync(path.join(S, "proj", "timeline.json"), JSON.stringify(tl, null, 2)); // as Claude would
  await win.waitForFunction(() => document.querySelectorAll(".clip.video").length === 2, null, { timeout: 10000 });

  // read the frame number on screen from the program viewer's centre pixel
  const shown = () => win.evaluate(() => {
    const c = document.querySelector('[data-testid="viewer-program"]');
    const t = document.createElement("canvas"); t.width = 8; t.height = 8;
    const x = t.getContext("2d"); x.drawImage(c, c.width / 2 - 4, c.height / 2 - 4, 8, 8, 0, 0, 8, 8);
    const d = x.getImageData(4, 4, 1, 1).data;
    const y = (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 1.164 + 16; // RGB → limited-range luma
    return ((Math.round((y - 24) / 8) % 24) + 24) % 24;
  });
  // wait until the viewer has rendered THIS time with the exact frame (not a previous render's state)
  const settle = () => win.waitForFunction(() => {
    const v = window.__viewers?.program, p = window.__blkedit.programT;
    return v && v.exactNow && v.layers > 0 && Math.abs(v.time - p.frameTime()) < 1e-6;
  }, null, { timeout: 8000 });
  const seek = async (t) => { await win.evaluate((t) => { const p = window.__blkedit.programT; p.pause(); p.seek(t); }, t); await settle(); await sleep(30); };

  // --- 1. frame-exact at arbitrary times (including after the cut, where c2 starts at source 1.0 s)
  const probes = [[0, 0], [1 / FPS, 1], [0.5, 15], [1.0, 30], [2.9, 87], [3.99, 119], [4.0, 30], [4.5, 45], [5.9, 87]];
  let exact = 0;
  const misses = [];
  for (const [t, srcFrame] of probes) {
    await seek(t); const got = await shown();
    if (got === srcFrame % 24) exact++;
    else misses.push(`${t}s: want ${srcFrame % 24} got ${got} [${JSON.stringify(await win.evaluate(() => { const v = window.__viewers.program; return { time: v.time, exactNow: v.exactNow, layers: v.layerInfo, canvas: v.canvas, renders: v.renders }; }))}]`);
  }
  check(exact === probes.length, "every probed time shows exactly the right frame", misses.join("; ") || `${exact}/${probes.length}`);

  // --- 2. frame stepping with → / ← lands on consecutive frames
  await seek(2.0);
  await win.locator('[data-testid="viewer-program"]').click();
  const steps = [];
  for (let i = 0; i < 5; i++) { await win.keyboard.press("ArrowRight"); await settle(); await sleep(40); steps.push(await shown()); }
  await win.keyboard.press("ArrowLeft"); await settle(); await sleep(40); steps.push(await shown());
  check(JSON.stringify(steps) === JSON.stringify([61, 62, 63, 64, 65, 64].map((n) => n % 24)), "→ and ← step one frame at a time", steps.join(","));

  // --- 3. scrub latency: random jumps across the timeline
  await win.evaluate(() => { window.__viewers.program.latencies = []; });
  for (let i = 0; i < 25; i++) await seek(Math.round(Math.random() * 5.8 * FPS) / FPS);
  const lat = await win.evaluate(() => window.__viewers.program.latencies.slice());
  lat.sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
  check(median < 250, "scrubbing to an undecoded spot shows the exact frame fast", `median ${median.toFixed(0)} ms, worst ${lat.length ? lat[lat.length - 1].toFixed(0) : 0} ms over ${lat.length} cache misses`);

  // --- 4. 1× playback: frames advance smoothly, in order, at ~30 fps
  await seek(0.2);
  const seen = await win.evaluate(async () => {
    const p = window.__blkedit.programT;
    const c = document.querySelector('[data-testid="viewer-program"]');
    const t = document.createElement("canvas"); t.width = 1; t.height = 1; const x = t.getContext("2d", { willReadFrequently: true });
    const out = [];
    p.play(1);
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      await new Promise((r) => requestAnimationFrame(r));
      x.drawImage(c, c.width / 2, c.height / 2, 1, 1, 0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      out.push(((Math.round(((0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 1.164 + 16 - 24) / 8) % 24) + 24) % 24);
    }
    p.pause();
    return out;
  });
  const distinct = seen.filter((v, i) => i === 0 || v !== seen[i - 1]);
  let backwards = 0;
  for (let i = 1; i < distinct.length; i++) if (((distinct[i] - distinct[i - 1] + 24) % 24) > 4) backwards++;
  check(distinct.length >= 50 && backwards === 0, "1× playback shows ~30 new frames per second, in order", `${distinct.length} distinct frames in 2 s, ${backwards} jumps`);

  // --- 5. J/K/L: L twice = 2×, J = reverse, K = stop
  await seek(1.0);
  await win.keyboard.press("l"); await win.keyboard.press("l");
  const r2 = await win.evaluate(() => window.__blkedit.programT.rate);
  const a = await win.evaluate(() => window.__blkedit.programT.time); await sleep(700); const b = await win.evaluate(() => window.__blkedit.programT.time);
  check(r2 === 2 && b - a > 1.0, "L L plays at 2×", `rate ${r2}, moved ${(b - a).toFixed(2)} s in 0.7 s`);
  await win.keyboard.press("k");
  await win.keyboard.press("j");
  const c0 = await win.evaluate(() => window.__blkedit.programT.time); await sleep(600);
  const revFrames = [];
  for (let i = 0; i < 6; i++) { revFrames.push(await shown()); await sleep(80); }
  const c1 = await win.evaluate(() => window.__blkedit.programT.time);
  await win.keyboard.press("k");
  check(c1 < c0 - 0.3, "J plays backwards", `${c0.toFixed(2)} → ${c1.toFixed(2)} s; frames ${revFrames.join(",")}`);
  const stopped = await win.evaluate(() => window.__blkedit.programT.rate);
  check(stopped === 0, "K stops");

  // --- 6. source monitor: click a clip, mark In/Out, add that range to the timeline
  await win.locator(".media-bin li").first().click();
  await win.waitForFunction(() => window.__viewers?.source?.exactNow && window.__viewers.source.layers > 0, null, { timeout: 8000 });
  await win.evaluate(() => { const s = window.__blkedit.sourceT; s.pause(); s.seek(2); });
  await win.keyboard.press("i");
  await win.evaluate(() => { const s = window.__blkedit.sourceT; s.seek(3.5); });
  await win.keyboard.press("o");
  await win.click("text=Add to timeline"); await sleep(800);
  st = await get("/api/state");
  const added = st.timeline.sequences[0].tracks.find((t) => t.kind === "video").clips.find((c) => c.id !== "c1" && c.id !== "c2");
  check(added && Math.abs(added.in - 2) < 0.04 && Math.abs(added.out - 3.5) < 0.04 && Math.abs(added.start - 6) < 0.04, "source In/Out → Add to timeline appends just that range", added ? `${added.id} in ${added.in} out ${added.out} at ${added.start}` : "no clip");

  // --- 7. audio: meters move while a clip with sound plays
  await win.evaluate(() => { const p = window.__blkedit.programT; p.pause(); p.seek(0); });
  await win.locator(".media-bin li").first().dblclick(); await sleep(300); // (puts a clip with sound on Audio 1 at the end)
  st = await get("/api/state");
  const tl2 = st.timeline;
  tl2.sequences[0].tracks.find((t) => t.kind === "audio").clips = [{ id: `c${tl2.nextId}`, media: m.id, start: 0, in: 0, out: 3, volume: 1, fadeIn: 0, fadeOut: 0 }];
  tl2.nextId++;
  fs.writeFileSync(path.join(S, "proj", "timeline.json"), JSON.stringify(tl2, null, 2));
  await sleep(1200);
  await win.click(".tabs >> text=Mixer");
  await win.locator('[data-testid="viewer-program"]').click();
  await win.keyboard.press("Space");
  await sleep(150);
  const startInfo = await win.evaluate(() => ({ rate: window.__blkedit.programT.rate, src: window.__blkedit.sourceT.rate, focus: document.activeElement?.tagName + "." + document.activeElement?.className, activeViewer: document.querySelector(".viewer.active")?.className }));
  check(startInfo.rate === 1, "Space plays the program after clicking it", JSON.stringify(startInfo));
  let peak = -Infinity;
  for (let i = 0; i < 20; i++) { await sleep(100); const p = await win.locator('[data-testid="meter-master"]').getAttribute("data-peak"); if (p && p !== "-inf") peak = Math.max(peak, Number(p)); }
  const audioDbg = JSON.stringify(await win.evaluate(() => window.__blkedit.audio.debug()));
  await win.keyboard.press("Space");
  check(peak > -30, "the master meter moves while sound plays", `peak ${Number.isFinite(peak) ? peak.toFixed(1) : "-∞"} dBFS${peak > -30 ? "" : ` ${audioDbg}`}`);

  // --- 8. export queue: two exports, cancel the second, the first finishes
  const e1 = await post("/api/export", {});
  const e2 = await post("/api/export", {});
  check(e1.status === 200 && e2.status === 200, "two exports queued", `${e1.body.name}, ${e2.body.name}`);
  await post(`/api/export/${e2.body.id}/cancel`);
  let ex;
  for (let i = 0; i < 120; i++) { ex = await get("/api/exports"); if (!ex.jobs.some((j) => j.state === "queued" || j.state === "running")) break; await sleep(500); }
  const j1 = ex.jobs.find((j) => j.id === e1.body.id), j2 = ex.jobs.find((j) => j.id === e2.body.id);
  check(j1.state === "done" && j2.state === "cancelled" && ex.files.some((f) => f.name === j1.name) && !ex.files.some((f) => f.name === j2.name), "the queue renders one, cancels the other", `${j1.state} / ${j2.state}`);

  // --- 9. Full quality on a 10-bit HEVC original (like DJI/iPhone footage): exact when paused,
  // straight from the original if this computer can decode it live, else via a full-res still
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `nullsrc=s=3840x2160:r=${FPS}:d=3,geq=lum='24+mod(N,24)*8':cb=128:cr=128`, "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=none", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", path.join(S, "footage", "hevc10.mp4")]);
  await post("/api/import", { paths: [path.join(S, "footage", "hevc10.mp4")] });
  for (let i = 0; i < 120; i++) { const q = (await get("/api/media/status")).queue; if (q.running + q.queued === 0) break; await sleep(500); }
  st = await get("/api/state");
  const hv = st.timeline.media.find((x) => x.name === "hevc10.mp4");
  const tl3 = st.timeline;
  tl3.sequences[0].tracks.find((t) => t.kind === "video").clips = [{ id: `c${tl3.nextId}`, media: hv.id, start: 0, in: 0, out: 3, volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 }];
  tl3.sequences[0].tracks.find((t) => t.kind === "audio").clips = [];
  tl3.nextId++;
  fs.writeFileSync(path.join(S, "proj", "timeline.json"), JSON.stringify(tl3, null, 2));
  await sleep(1200);
  await win.click('.quality button:has-text("Full")');
  const hevcLive = await win.evaluate(async (codec) => { try { return (await VideoDecoder.isConfigSupported({ codec, codedWidth: 3840, codedHeight: 2160 })).supported; } catch { return false; } }, "hvc1.2.4.L153.90");
  const fullHits = [];
  for (const f of [10, 45, 71]) {
    await win.evaluate((t) => { const p = window.__blkedit.programT; p.pause(); p.seek(t); }, f / FPS);
    await win.waitForFunction(() => { const v = window.__viewers?.program; return v && v.layers > 0 && Math.abs(v.time - window.__blkedit.programT.frameTime()) < 1e-6 && v.layerInfo[0].w >= 3840; }, null, { timeout: 30000 }).catch(() => {}); // full resolution, either path
    await sleep(400);
    const w = await win.evaluate(() => window.__viewers.program.layerInfo[0]?.w);
    fullHits.push(`${(await shown()) === f % 24 ? "exact" : "WRONG"}@${w}px`);
  }
  check(fullHits.every((h) => h.startsWith("exact")), "Full quality on 10-bit HEVC 4K: paused frames are exact", `${fullHits.join(", ")} · ${hevcLive ? "decoded live from the original (hardware HEVC)" : "this computer can't decode HEVC live, so paused frames come from full-res stills"}`);
  await win.click('.quality button:has-text("Proxy")');

  const stats = await win.evaluate(() => window.__viewers.program.engine);
  console.log(`  engine: ${JSON.stringify(stats)}`);
  await win.screenshot({ path: path.join(S, "playback.png") });
  console.log(`  screenshot: ${path.join(S, "playback.png")}`);
  await app.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} check(s) failed` : "\nall playback checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
