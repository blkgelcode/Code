// Phase 4 pro editing, tested inside the real Mac app (Electron), driven the way she works:
// source In/Out + Insert/Overwrite with linked picture+sound, timeline In/Out + Extract,
// ripple delete, markers (incl. a note for Claude), ⌘K palette, blade tool, trim/J-cut drags,
// nesting, timecode jump, a custom shortcut, Claude editing alongside, and an export of all of it.
// Run: npm run test:editing   (Linux needs xvfb-run; macOS runs it directly)
const { _electron } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const APP = path.resolve(__dirname, "..");
const S = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-editing-"));
const PROJ = path.join(S, "proj");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, what, detail = "") => { results.push(!!ok); console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); };
fs.mkdirSync(path.join(S, "footage"));
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=8", "-f", "lavfi", "-i", "sine=f=440:d=8:sample_rate=48000",
  "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(S, "footage", "talk.mp4")]);

const readTl = () => JSON.parse(fs.readFileSync(path.join(PROJ, "timeline.json"), "utf8"));
const seqOf = (tl, id = tl.activeSequence) => tl.sequences.find((s) => s.id === id);
const clipsOf = (tl, kind) => seqOf(tl).tracks.filter((t) => !kind || t.kind === kind).flatMap((t) => t.clips);
const spans = (tl, tid) => seqOf(tl).tracks.find((t) => t.id === tid).clips.map((c) => `${+c.start.toFixed(2)}-${+(c.start + (c.duration ?? c.out - c.in)).toFixed(2)}`).join(" ");
const dur = (tl) => Math.max(0, ...clipsOf(tl).map((c) => c.start + (c.duration ?? c.out - c.in)));

(async () => {
  const app = await _electron.launch({
    executablePath: path.join(APP, "node_modules/electron/dist/electron"),
    args: [APP, ...(process.platform === "linux" ? ["--no-sandbox"] : []), "--project", PROJ],
    env: { ...process.env, PORT: "5322" },
  });
  const win = await app.firstWindow();
  await win.waitForSelector(".topbar", { timeout: 30000 });
  const post = (p, b) => win.evaluate(async ([p, b]) => { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }); return { status: r.status, body: await r.json() }; }, [p, b]);
  const get = (p) => win.evaluate(async (p) => (await fetch(p)).json(), p);
  const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* file mid-write */ } await sleep(100); } check(false, `timed out: ${what}`); return false; };
  const seekProgram = async (t) => { await win.locator('[data-testid="viewer-program"]').click(); await win.evaluate((t) => { const p = window.__blkedit.programT; p.pause(); p.seek(t); }, t); await sleep(80); };
  const seekSource = (t) => win.evaluate((t) => { const s = window.__blkedit.sourceT; s.pause(); s.seek(t); }, t);
  const key = async (k) => { await win.keyboard.press(k); await sleep(250); };
  const markSource = async (a, b) => { await win.locator("[data-testid='viewer-source']").click(); await seekSource(a); await key("i"); await seekSource(b); await key("o"); };

  await post("/api/import", { paths: [path.join(S, "footage")] });
  for (let i = 0; i < 120; i++) { const q = (await get("/api/media/status")).queue; if (q.running + q.queued === 0) break; await sleep(500); }

  // ---- three-point editing from the source monitor, picture + sound linked
  await win.locator(".media-bin li").first().click(); await sleep(400);  // opens it in Source
  await seekProgram(0);
  await markSource(1, 3);
  await key(",");
  await until(() => clipsOf(readTl()).length === 2, "insert");
  let tl = readTl();
  const [v, a] = [clipsOf(tl, "video")[0], clipsOf(tl, "audio")[0]];
  check(v && a && v.link && v.link === a.link && v.in === 1 && v.out === 3, "Insert (,) puts the marked 2 s in as linked picture + sound", JSON.stringify({ v: v && [v.in, v.out, v.link], a: a && [a.in, a.out, a.link] }));
  check(Math.abs(await win.evaluate(() => window.__blkedit.programT.time) - 2) < 0.05, "playhead moves to the end of the edit");
  await markSource(4, 6);
  await key(",");                                               // second shot at 0:02
  await until(() => clipsOf(readTl(), "video").length === 2, "second shot");
  await seekProgram(1);
  await markSource(0, 1);
  await key(",");                                               // 1 s insert at 0:01 pushes everything
  await until(() => clipsOf(readTl(), "video").length === 4, "second insert");
  tl = readTl();
  check(spans(tl, "v1") === "0-1 1-2 2-3 3-5" && spans(tl, "a1") === "0-1 1-2 2-3 3-5", "Insert at 0:01 splits and pushes picture and sound together", `${spans(tl, "v1")} | ${spans(tl, "a1")}`);
  await seekProgram(0); await win.locator("[data-testid='viewer-source']").click();
  await key(".");                                               // source marks still 0–1                                               // overwrite 1 s at 0:00
  await until(() => readTl().sequences[0].tracks[0].clips[0].in === 0, "overwrite");
  tl = readTl();
  check(dur(tl) === 5 && clipsOf(tl, "video").length === 4, "Overwrite (.) replaces in place: length unchanged", spans(tl, "v1"));

  // ---- markers
  await seekProgram(0.5); await key("m");
  await seekProgram(4.5); await key("Shift+c");
  await until(() => seqOf(readTl()).markers.length === 2, "markers");
  tl = readTl();
  check(seqOf(tl).markers.map((k) => k.type).join() === "comment,claude", "M adds a marker, ⇧C a note for Claude", JSON.stringify(seqOf(tl).markers));
  check(await win.locator('[data-testid="markers"] .mk').count() === 2, "Markers panel opens and lists them");
  await win.locator(".mk.on .mk-note").fill("tighten this pause");
  await win.locator(".mk.on .mk-name").click(); await sleep(400);
  await until(() => seqOf(readTl()).markers.some((k) => k.note === "tighten this pause"), "marker note saved");
  check(true, "a note typed in the panel is saved in timeline.json");

  // ---- timeline In/Out + Extract (ripples sync-locked tracks and moves markers)
  await seekProgram(1); await key("i");
  await seekProgram(2); await key("o");
  await until(() => seqOf(readTl()).marks?.out === 2, "timeline marks");
  await key("'");
  await until(() => dur(readTl()) === 4, "extract");
  tl = readTl();
  check(spans(tl, "v1") === "0-1 1-2 2-4" && spans(tl, "a1") === "0-1 1-2 2-4", "Extract (') removes In→Out from picture and sound and closes up", spans(tl, "v1"));
  check(seqOf(tl).markers.find((k) => k.type === "claude").t === 3.5, "markers after the cut move with it");

  // ---- ripple delete a clicked clip: its linked sound goes too
  await win.locator('.clip.video[data-clip]').nth(1).click(); await sleep(150);
  check(await win.locator(".clip.selected").count() === 2, "clicking a picture clip selects its linked sound too");
  await key("Shift+Backspace");
  await until(() => dur(readTl()) === 3, "ripple delete");
  check(spans(readTl(), "v1") === "0-1 1-3" && spans(readTl(), "a1") === "0-1 1-3", "⇧⌫ ripple delete closes the gap on both", spans(readTl(), "v1"));

  // ---- J cut: Roll tool (N) + ⌥ on the sound's cut: the second shot's sound starts early, picture stays
  await key("n");
  const clipA = win.locator('.clip.audio[data-clip]').nth(1);
  const boxA = await clipA.boundingBox();
  const zoomPx = await win.evaluate(() => Number(document.querySelector(".zoom input").value));
  await win.keyboard.down("Alt");
  await win.mouse.move(boxA.x + 2, boxA.y + boxA.height / 2); await win.mouse.down();
  await win.mouse.move(boxA.x + 2 - zoomPx * 0.5, boxA.y + boxA.height / 2, { steps: 6 }); await win.mouse.up();
  await win.keyboard.up("Alt"); await sleep(600);
  tl = readTl();
  const offs = await win.locator(".sync-badge").count();
  check(spans(tl, "v1") === "0-1 1-3" && spans(tl, "a1") === "0-0.5 0.5-3" && offs === 0, "⌥ + Roll on the sound makes a J cut (picture untouched, still in sync, no badge)", `${spans(tl, "v1")} | ${spans(tl, "a1")}`);
  await key("v");
  await win.click('button[title^="Undo your last change"]');   // what ⌘Z does via the Mac menu
  check(await until(() => spans(readTl(), "a1") === "0-1 1-3", "undo J cut"), "Undo puts it back");

  // ---- ⌘K-style palette (BLKGRLCO preset: ⌘P) runs a command by name
  await seekProgram(2);
  await key(process.platform === "darwin" ? "Meta+p" : "Control+p");
  check(await win.locator('[data-testid="palette"]').isVisible(), "command palette opens");
  await win.keyboard.type("split all"); await sleep(150); await key("Enter");
  await until(() => clipsOf(readTl(), "video").length === 3, "palette split");
  check(spans(readTl(), "v1") === "0-1 1-2 2-3", "palette: “Split all tracks at playhead” ran", spans(readTl(), "v1"));

  // ---- blade tool
  await key("c");
  check(await win.locator('.toolbox button[data-tool="blade"].on').count() === 1, "C picks the blade tool");
  const first = win.locator('.clip.video[data-clip]').first();
  const fb = await first.boundingBox();
  await win.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2); await sleep(400);
  check(clipsOf(readTl(), "video").length === 4 && clipsOf(readTl(), "audio").length === 4, "blade click cuts the clip and its linked sound", spans(readTl(), "v1"));
  await key("v");

  // ---- timecode jump: type digits
  await win.locator('[data-testid="viewer-program"]').click();
  await key("1"); await win.keyboard.type("5"); await key("Enter");
  check(Math.abs(await win.evaluate(() => window.__blkedit.programT.time) - 0.5) < 0.02, "typing 15 ⏎ jumps to 00:00:00:15");

  // ---- custom shortcut: G = split
  await win.click("text=⌨ Shortcuts");
  const row = win.locator(".sc-row", { hasText: "Split at playhead (add edit)" });
  await row.locator(".sc-key").click(); await key("g");
  await win.click('.shortcuts-head button:has-text("Done")');
  const saved = JSON.parse(await win.evaluate(() => localStorage.getItem("blkedit.keys")));
  check(saved.custom.split?.[0] === "g", "shortcut editor saves G for Split", JSON.stringify(saved.custom));
  await seekProgram(2.5); await key("g");
  await until(() => clipsOf(readTl(), "video").length === 5, "custom split");
  check(clipsOf(readTl(), "video").length === 5, "the new shortcut works");

  // ---- nest the last two shots, open it, back
  await win.locator('.clip.video[data-clip]').nth(3).click();
  await win.locator('.clip.video[data-clip]').nth(4).click({ modifiers: ["Shift"] });
  await key("Alt+g");
  await until(() => readTl().sequences.length === 2, "nest");
  tl = readTl();
  const nested = clipsOf(tl, "video").find((c) => c.seq);
  check(nested && spans(tl, "v1").endsWith("2-3") && clipsOf(tl, "audio").length === 3, "⌥G nests the shots (and their sound) into one clip", `${spans(tl, "v1")} | audio ${spans(tl, "a1")}`);
  await win.locator(`.clip[data-clip="${nested.id}"]`).dblclick(); await sleep(500);
  check(readTl().activeSequence === nested.seq && await win.locator(".clip.video").count() === 2, "double-click opens the nested sequence");
  await win.locator('.seq-tabs button[data-seq="s1"]').click(); await sleep(400);

  // ---- the nested clip plays (picture comes through the flattener)
  await seekProgram(2.5);
  await win.waitForFunction(() => (window.__viewers?.program?.layers || 0) > 0, null, { timeout: 15000 }).catch(() => {});
  check(await win.evaluate(() => window.__viewers?.program?.layers > 0), "program monitor shows the nested sequence's picture");

  // ---- Claude adds a chapter marker by editing the file; it shows up
  tl = readTl();
  seqOf(tl).markers.push({ id: `k${tl.nextId}`, t: 0, duration: 0, name: "Intro", color: "berry", type: "chapter" });
  tl.nextId++;
  fs.writeFileSync(path.join(PROJ, "timeline.json"), JSON.stringify(tl, null, 2));
  await win.waitForSelector(".marker.chapter", { timeout: 8000 }).catch(() => {});
  check(await win.locator(".marker.chapter").count() === 1, "a marker Claude writes into timeline.json appears in her ruler");

  // ---- export everything (nested + linked): sound isn't doubled, length is right
  const q = await post("/api/export", {});
  let job;
  for (let i = 0; i < 240; i++) { job = (await get("/api/exports")).jobs.find((j) => j.id === q.body.id); if (job && !["queued", "running"].includes(job.state)) break; await sleep(500); }
  check(job?.state === "done", "export with nested + linked clips finishes", job?.error || JSON.stringify(job));
  if (job?.state === "done") {
    const out = path.join(PROJ, "exports", job.name);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", out]).toString());
    const vd = String(require("child_process").spawnSync("ffmpeg", ["-hide_banner", "-i", out, "-af", "volumedetect", "-f", "null", "-"]).stderr);
    const max = Number(/max_volume: (-?[\d.]+) dB/.exec(vd)?.[1]);
    check(Math.abs(Number(probe.format.duration) - dur(readTl())) < 0.15 && probe.streams.some((s) => s.codec_type === "audio"), "exported length matches the timeline, with sound", `${probe.format.duration}s`);
    // the test tone (ffmpeg sine, amplitude 1/8) peaks near −15 dBFS; played twice (picture + linked sound) it would be ~6 dB louder
    check(max < -12, "linked picture+sound plays the sound once (no doubling)", `max ${max} dB`);
  }
  await win.screenshot({ path: path.join(S, "editing.png") });
  console.log(`  screenshot: ${path.join(S, "editing.png")}`);
  await app.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} check(s) failed` : "\nall editing checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
