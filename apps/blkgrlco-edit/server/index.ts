// BLKGRLCO Edit server (v2).
//   - project/timeline.json is the single source of truth; the Store owns it plus its history.
//   - The UI sends ops (POST /api/ops); anything else that changes the file (Claude Code) is
//     picked up by the watcher, diffed into ops, and recorded as Claude's.
//   - Every change is broadcast over one WebSocket.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import chokidar from "chokidar";
import { WebSocketServer, type WebSocket } from "ws";
import { Store, Conflict, type Author, type Entry } from "./store";
import { MediaEngine, type MediaStatus } from "./media/engine";
import { walk } from "./media/probe";
import { capabilities, hdrToSdr } from "./media/caps";
import { loadFonts } from "./fonts";
import { runExport } from "./export";
import { activeSeq, type Media, type Timeline } from "../shared/model";
import type { Op } from "../shared/ops";

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from server/ (tsx) and from dist-server/ (bundled): the app folder holds index.html.
const appDir = [path.resolve(here, ".."), path.resolve(here, "../..")].find((d) => fs.existsSync(path.join(d, "index.html"))) || path.resolve(here, "..");
const argv = process.argv.slice(2);
const flag = (name: string, def?: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const DEV = argv.includes("--dev");
const PORT = Number(flag("port", process.env.PORT || "5310"));
const PROJECT = path.resolve(flag("project", process.env.BLKEDIT_PROJECT || path.join(appDir, "project"))!);
const EXPORTS = path.join(PROJECT, "exports");
const WORK = path.join(PROJECT, ".cache", "work");
const DROP = path.join(PROJECT, "media"); // files dropped here are imported automatically
for (const d of [PROJECT, EXPORTS, WORK, DROP, path.join(PROJECT, "fonts")]) fs.mkdirSync(d, { recursive: true });

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

// ------------------------------------------------------------------ single instance per project
const LOCK = path.join(PROJECT, ".history", "server.lock");
function takeLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  try {
    const { pid, port } = JSON.parse(fs.readFileSync(LOCK, "utf8"));
    if (pid !== process.pid) { process.kill(pid, 0); console.error(`This project is already open (pid ${pid}, port ${port}). Close that one first.`); process.exit(3); }
  } catch { /* no lock, or a stale one from a crash */ }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, port: PORT, at: new Date().toISOString() }));
  const release = () => { try { if (JSON.parse(fs.readFileSync(LOCK, "utf8")).pid === process.pid) fs.unlinkSync(LOCK); } catch { /* */ } };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { engine?.stopAll(); process.exit(0); });
}
takeLock();
// A crash should restart cleanly (the supervisor relaunches us), never limp on with bad state.
process.on("uncaughtException", (e) => { console.error("crash:", e); engine?.stopAll(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("crash:", e); process.exit(1); });

// ------------------------------------------------------------------ state
const store = new Store(PROJECT);
store.boot();
for (const n of store.bootNotes) log(n);
const engine = new MediaEngine(PROJECT, (statuses) => broadcast({ type: "media-status", statuses, queue: engine.queueInfo() }), log);
let fonts = loadFonts(PROJECT);
let presence: { author: Author; message: string; until: number } | null = null;

const sockets = new Set<WebSocket>();
function broadcast(msg: unknown) {
  const s = JSON.stringify(msg);
  for (const c of sockets) if (c.readyState === 1) c.send(s);
}
const undoState = () => ({ you: { undo: store.canUndo("you"), redo: store.canRedo("you") }, claude: { undo: store.canUndo("claude"), redo: store.canRedo("claude") } });
function announce(entry: Entry | null) {
  if (!entry) return;
  broadcast({ type: "change", timeline: store.tl, rev: store.rev, entry: store.summary(entry), warnings: store.warnings, undo: undoState() });
  if (entry.author === "claude" && entry.kind === "edit") setPresence("claude", "editing the timeline", 4000);
  syncEngine();
}
function setPresence(author: Author, message: string, ms: number) {
  presence = { author, message, until: Date.now() + ms };
  broadcast({ type: "presence", presence });
}

// ------------------------------------------------------------------ media
/** Clips on any timeline get their previews made first. */
function syncEngine() {
  const used = new Set<string>();
  for (const sq of store.tl.sequences) for (const t of sq.tracks) for (const c of t.clips) if ("media" in c) used.add(c.media);
  engine.sync(store.tl.media, used);
}
const mediaStatuses = () => Object.fromEntries(store.tl.media.map((m) => [m.id, engine.status(m)])) as Record<string, MediaStatus>;

let importing = false;
/**
 * Add files (or every media file inside folders) by absolute path. Nothing is copied or loaded:
 * files are read with ffprobe in parallel and appear in the bin in batches as they're read.
 * A file that's already in the project is skipped; one that matches an OFFLINE clip's
 * fingerprint reconnects that clip instead of being added twice.
 */
async function importPaths(paths: string[], author: Author) {
  const files: string[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const p of paths) {
    const abs = path.resolve(p);
    let st: fs.Stats;
    try { st = fs.statSync(abs); } catch { failed.push({ path: abs, error: "not found" }); continue; }
    if (st.isDirectory()) files.push(...walk(abs));
    else files.push(abs);
  }
  const have = new Set(store.tl.media.map((m) => m.path));
  const fresh = [...new Set(files)].filter((f) => !have.has(f));
  const total = fresh.length;
  const added: string[] = [];
  const relinked: string[] = [];
  let pending: Media[] = [];
  let done = 0;
  let n = store.tl.media.reduce((mx, m) => Math.max(mx, Number(/^m(\d+)$/.exec(m.id)?.[1] || 0)), 0);
  broadcast({ type: "import", done, total, failed: failed.length });

  const flush = () => {
    if (!pending.length) return;
    // ids in folder order, whatever order the files finished reading in
    const batch = pending.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    pending = [];
    const ops: Op[] = [];
    for (const value of batch) {
      value.id = `m${++n}`;
      const lost = value.fingerprint && store.tl.media.find((m) => m.fingerprint === value.fingerprint && !engine.isOnline(m.id));
      if (lost) { ops.push({ t: "set", target: { kind: "media", id: lost.id }, key: "path", value: value.path, prev: lost.path }); relinked.push(lost.id); }
      else { ops.push({ t: "addMedia", value }); added.push(value.id); }
    }
    try { announce(store.applyEdit(ops, author).entry); } catch (e) { log("import batch failed:", (e as Error).message); }
  };
  let flushTimer: NodeJS.Timeout | undefined;
  fresh.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const next = async (): Promise<void> => {
    const f = fresh.shift();
    if (!f) return;
    // await FIRST: `pending.push(await …)` would capture the array before a flush replaces it
    try { const facts = await engine.describe(f); pending.push({ id: "", ...facts } as Media); }
    catch (e) { failed.push({ path: f, error: String((e as Error).message).split("\n")[0] }); }
    done++;
    broadcast({ type: "import", done, total, failed: failed.length });
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = undefined; flush(); }, 250);
    return next();
  };
  importing = true;
  try { await Promise.all(Array.from({ length: Math.min(6, total || 1) }, next)); }
  finally { importing = false; clearTimeout(flushTimer); flush(); }
  broadcast({ type: "import", done: total, total, failed: failed.length, finished: true });
  return { added, relinked, skipped: files.length - total, failed };
}

/** Every 2 s: which files are reachable; reconnect drives that came back under another name. */
function watchOnline() {
  const tick = () => {
    if (importing) return;
    const { relinks, changed } = engine.checkOnline(store.tl.media);
    if (relinks.length) {
      const ops: Op[] = relinks.map((r) => ({ t: "set", target: { kind: "media", id: r.id }, key: "path", value: r.path, prev: store.tl.media.find((m) => m.id === r.id)!.path }));
      try { announce(store.applyEdit(ops, "app").entry); } catch (e) { log("relink failed:", (e as Error).message); }
    }
    if (changed || relinks.length) syncEngine();
  };
  tick();
  setInterval(tick, 2000);
}

// ------------------------------------------------------------------ HTTP
const app = express();
app.use(express.json({ limit: "50mb" }));

const errorOut = (res: express.Response, e: unknown) => {
  if (e instanceof Conflict) return res.status(409).json({ error: e.message, timeline: store.tl, rev: store.rev });
  log("error:", e);
  res.status(500).json({ error: String((e as Error)?.message || e) });
};
const authorOf = (v: unknown): Author => (v === "claude" ? "claude" : v === "app" ? "app" : "you");

app.get("/api/state", (_req, res) => {
  res.json({
    timeline: store.tl, rev: store.rev, warnings: store.warnings, fileError: store.fileError, bootNotes: store.bootNotes,
    history: store.entries.slice(-200).map((e) => store.summary(e)), undo: undoState(),
    fonts: [...fonts.values()].map((f) => ({ key: f.key, source: f.source })),
    mediaStatus: mediaStatuses(), queue: engine.queueInfo(), exports: exportsView(), presence: presence && presence.until > Date.now() ? presence : null, projectDir: PROJECT,
  });
});

app.post("/api/ops", (req, res) => {
  try {
    const { ops, author } = req.body as { ops: Op[]; author?: string };
    if (!Array.isArray(ops)) return res.status(400).json({ error: "ops must be an array" });
    const { entry, idMap } = store.applyEdit(ops, authorOf(author));
    announce(entry);
    res.json({ rev: store.rev, idMap });
  } catch (e) { errorOut(res, e); }
});

for (const action of ["undo", "redo"] as const) {
  app.post(`/api/${action}`, (req, res) => {
    try {
      const author = authorOf(req.body?.author);
      const entry = action === "undo" ? store.undo(author) : store.redoLast(author);
      announce(entry);
      res.json({ rev: store.rev, entry: store.summary(entry) });
    } catch (e) { errorOut(res, e); }
  });
}
app.post("/api/revert", (req, res) => {
  try { const e = store.revert(Number(req.body?.rev), authorOf(req.body?.author)); announce(e); res.json({ rev: store.rev, entry: store.summary(e) }); }
  catch (e) { errorOut(res, e); }
});
app.post("/api/restore", (req, res) => {
  try { const e = store.restore(Number(req.body?.rev), authorOf(req.body?.author)); announce(e); res.json({ rev: store.rev, entry: store.summary(e) }); }
  catch (e) { errorOut(res, e); }
});
app.get("/api/history", (req, res) => {
  const limit = Math.min(1000, Number(req.query.limit) || 200);
  res.json(store.entries.slice(-limit).map((e) => store.summary(e)));
});
app.get("/api/history/:rev", (req, res) => {
  const e = store.entries.find((x) => x.rev === Number(req.params.rev));
  return e ? res.json({ ...e, undone: store.isUndone(e.rev) }) : res.status(404).json({ error: "no such rev" });
});
app.get("/api/history/:rev/timeline", (req, res) => {
  try { res.json(store.stateAt(Number(req.params.rev))); } catch (e) { errorOut(res, e); }
});
app.post("/api/presence", (req, res) => {
  const { author, message, ttl } = req.body || {};
  if (!message) { presence = null; broadcast({ type: "presence", presence: null }); return res.json({ ok: true }); }
  setPresence(authorOf(author), String(message).slice(0, 120), Math.min(Number(ttl) || 120000, 600000));
  res.json({ ok: true });
});

app.post("/api/import", async (req, res) => {
  try {
    const paths = req.body?.paths;
    if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ error: "paths must be a non-empty array of absolute paths" });
    res.json(await importPaths(paths.map(String), authorOf(req.body?.author)));
  } catch (e) { errorOut(res, e); }
});

const byId = (id: string) => store.tl.media.find((m) => m.id === id);
const send = (res: express.Response, p?: string | null) => (p && fs.existsSync(p) ? res.sendFile(p, { dotfiles: "allow" }) : res.status(404).end());

// Small assets (made by the background queue). 404 until they exist; the UI shows a placeholder.
for (const kind of ["thumb", "strip", "wave", "still"] as const) {
  app.get(`/api/media/:id/${kind}`, (req, res) => { const m = byId(req.params.id); return m ? send(res, engine.asset(m, kind)) : res.status(404).end(); });
}
// Video for the player, streamed with HTTP range requests (sendFile answers Range with 206),
// so seeking never downloads a whole file and nothing is held in memory.
app.get("/api/media/:id/proxy", (req, res) => { const m = byId(req.params.id); return m ? send(res, engine.asset(m, "proxy")) : res.status(404).end(); });
app.get("/api/media/:id/original", (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).end();
  if (!engine.isOnline(m.id)) return res.status(410).json({ error: `${m.name} is offline` });
  send(res, m.path);
});
// One full-resolution frame from the original (Full quality while paused).
app.get("/api/media/:id/frame", async (req, res) => {
  const m = byId(req.params.id);
  if (!m || m.type === "audio") return res.status(404).end();
  if (!engine.isOnline(m.id)) return res.status(410).json({ error: `${m.name} is offline` });
  // ffmpeg returns the first frame at or after the seek time; seeking half a frame early returns the
  // frame that's ON SCREEN at t (t rounded up by a hair would otherwise give the next frame)
  const t = Math.max(0, (Number(req.query.t) || 0) - 0.5 / (m.fps || 30));
  const w = Math.min(3840, Math.max(160, Number(req.query.w) || 1920));
  const caps = await capabilities();
  const tm = m.hdr && caps.tonemap ? hdrToSdr(m.hdr) : "";
  const { spawn } = await import("node:child_process");
  const args = ["-v", "error", ...(m.type === "video" ? ["-ss", t.toFixed(6)] : []), "-i", m.path, "-frames:v", "1", "-vf", `${tm}scale='min(${w},iw)':-2,format=yuvj420p`, "-q:v", "2", "-f", "image2", "-c:v", "mjpeg", "pipe:1"];
  const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });
  res.type("image/jpeg");
  p.stdout.pipe(res);
  p.on("close", (code) => { if (code !== 0 && !res.headersSent) res.status(500).end(); });
  req.on("close", () => p.kill("SIGKILL"));
});
app.get("/api/media/status", (_req, res) => res.json({ statuses: mediaStatuses(), queue: engine.queueInfo() }));
app.post("/api/media/:id/retry", (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).json({ error: "no such media" });
  engine.retry(m);
  syncEngine();
  res.json({ ok: true });
});
/** Point a clip's media at a new file (manual relink). Refuses different footage unless forced. */
app.post("/api/media/:id/relink", (req, res) => {
  const m = byId(req.params.id);
  const to = String(req.body?.path || "");
  if (!m) return res.status(404).json({ error: "no such media" });
  if (!fs.existsSync(to)) return res.status(400).json({ error: "that file doesn't exist" });
  if (!req.body?.force && !engine.sameFile(m, to)) return res.status(409).json({ error: `${path.basename(to)} isn't the same footage as ${m.name} (different content). Relink anyway?`, needsForce: true });
  try {
    const ops: Op[] = [{ t: "set", target: { kind: "media", id: m.id }, key: "path", value: to, prev: m.path }];
    announce(store.applyEdit(ops, authorOf(req.body?.author)).entry);
    engine.checkOnline(store.tl.media);
    syncEngine();
    res.json({ ok: true });
  } catch (e) { errorOut(res, e); }
});
app.get("/api/font/:key", (req, res) => { const f = fonts.get(req.params.key); return f ? res.sendFile(f.file) : res.status(404).end(); });
app.post("/api/fonts/reload", (_req, res) => { fonts = loadFonts(PROJECT); res.json({ fonts: [...fonts.values()].map((f) => ({ key: f.key, source: f.source })) }); });

// ------------------------------------------------------------------ export queue
// Jobs run one at a time, each from a snapshot of its sequence taken when it was queued (so you
// can keep editing). The queue is saved in .cache/exports.json: after a crash or restart, queued
// and interrupted jobs run again.
interface ExportJob {
  id: string; name: string; file: string; seqName: string; state: "queued" | "running" | "done" | "error" | "cancelled";
  progress: number; error?: string; queuedAt: string; startedAt?: string; finishedAt?: string; timeline: Timeline; seq: string;
}
const QUEUE_FILE = path.join(PROJECT, ".cache", "exports.json");
let exportJobs: ExportJob[] = [];
try { exportJobs = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8")); for (const j of exportJobs) if (j.state === "running") { j.state = "queued"; j.progress = 0; } } catch { /* none yet */ }
let killExport: (() => void) | null = null;
let lastProgressSent = 0;
const exportsView = () => ({
  jobs: exportJobs.slice(-30).map(({ timeline, ...j }) => { void timeline; return j; }),
  files: fs.readdirSync(EXPORTS).filter((f) => f.endsWith(".mp4") && !f.includes(".part")).map((f) => { const st = fs.statSync(path.join(EXPORTS, f)); return { name: f, size: st.size, at: st.mtime.toISOString(), path: path.join(EXPORTS, f) }; }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
  dir: EXPORTS,
});
function saveQueue() {
  fs.writeFileSync(QUEUE_FILE + ".tmp", JSON.stringify(exportJobs.filter((j) => j.state === "queued" || j.state === "running" || Date.now() - Date.parse(j.finishedAt || j.queuedAt) < 7 * 864e5)));
  fs.renameSync(QUEUE_FILE + ".tmp", QUEUE_FILE);
}
const announceExports = () => { saveQueue(); broadcast({ type: "exports", exports: exportsView() }); };

async function pumpExports() {
  if (killExport) return;
  const job = exportJobs.find((j) => j.state === "queued");
  if (!job) return;
  const seq = job.timeline.sequences.find((x) => x.id === job.seq)!;
  const offline = job.timeline.media.filter((m) => seq.tracks.some((t) => t.clips.some((c) => "media" in c && c.media === m.id)) && !fs.existsSync(m.path));
  if (offline.length) { job.state = "error"; job.error = `${offline.map((m) => m.name).slice(0, 3).join(", ")} ${offline.length > 1 ? "are" : "is"} offline`; job.finishedAt = new Date().toISOString(); announceExports(); return pumpExports(); }
  job.state = "running"; job.startedAt = new Date().toISOString(); job.progress = 0;
  killExport = () => {};
  announceExports();
  const tmp = job.file.replace(/\.mp4$/, ".part.mp4");
  try {
    const caps = await capabilities();
    await runExport(job.timeline, seq, { fonts, workDir: WORK, outFile: tmp, caps }, (p) => {
      job.progress = p;
      if (Date.now() - lastProgressSent > 250) { lastProgressSent = Date.now(); broadcast({ type: "exports", exports: exportsView() }); }
    }, (kill) => { killExport = kill; });
    if ((job.state as string) === "cancelled") throw new Error("cancelled");
    fs.renameSync(tmp, job.file);
    job.state = "done"; job.progress = 1;
    log(`exported ${job.file}`);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* */ }
    if ((job.state as string) !== "cancelled") { job.state = "error"; job.error = String((e as Error).message).slice(0, 400); log(`export failed: ${job.error}`); }
  } finally {
    job.finishedAt = new Date().toISOString();
    killExport = null;
    announceExports();
    pumpExports();
  }
}

app.get("/api/exports", (_req, res) => res.json(exportsView()));
app.post("/api/export", (req, res) => {
  const seq = req.body?.sequence ? store.tl.sequences.find((x) => x.id === req.body.sequence) : activeSeq(store.tl);
  if (!seq) return res.status(404).json({ error: "no such sequence" });
  if (!seq.tracks.some((t) => t.clips.length)) return res.status(400).json({ error: `${seq.name} is empty.` });
  const usedIds = new Set(seq.tracks.flatMap((t) => t.clips.map((c) => ("media" in c ? c.media : ""))).filter(Boolean));
  const offline = store.tl.media.filter((m) => usedIds.has(m.id) && !engine.isOnline(m.id));
  if (offline.length) return res.status(409).json({ error: `Export needs the original files, and ${offline.length === 1 ? `${offline[0].name} is` : `${offline.length} files are`} offline (${offline.slice(0, 3).map((m) => m.name).join(", ")}). Plug the drive back in.` });
  const base = `${store.tl.project.name}-${seq.name}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "export";
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  let file = path.join(EXPORTS, `${base}-${stamp}.mp4`);
  for (let i = 2; exportJobs.some((j) => j.file === file) || fs.existsSync(file); i++) file = path.join(EXPORTS, `${base}-${stamp}-${i}.mp4`);
  const job: ExportJob = { id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: path.basename(file), file, seqName: seq.name, state: "queued", progress: 0, queuedAt: new Date().toISOString(), timeline: structuredClone(store.tl), seq: seq.id };
  exportJobs.push(job);
  announceExports();
  pumpExports();
  res.json({ id: job.id, name: job.name, queued: exportJobs.filter((j) => j.state === "queued").length });
});
app.post("/api/export/:id/cancel", (req, res) => {
  const job = exportJobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "no such export" });
  if (job.state === "queued") { job.state = "cancelled"; job.finishedAt = new Date().toISOString(); }
  else if (job.state === "running") { job.state = "cancelled"; killExport?.(); }
  announceExports();
  res.json({ ok: true });
});
app.use("/exports", express.static(EXPORTS));

// ------------------------------------------------------------------ start
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => { sockets.add(ws); ws.on("close", () => sockets.delete(ws)); ws.send(JSON.stringify({ type: "hello", rev: store.rev })); });

async function start() {
  if (DEV) {
    const { createServer } = await import("vite");
    const vite = await createServer({ root: appDir, server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(appDir, "dist");
    if (!fs.existsSync(dist)) { console.error("No build yet. Run `npm run build`."); process.exit(1); }
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  chokidar.watch(store.file, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 } })
    .on("add", onFileChange).on("change", onFileChange).on("unlink", () => log("timeline.json was deleted; it will be rewritten on the next change"));
  let dropTimer: NodeJS.Timeout | undefined;
  chokidar.watch(DROP, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 }, ignored: (p: string) => path.basename(p).startsWith(".") && p !== DROP })
    .on("all", () => { clearTimeout(dropTimer); dropTimer = setTimeout(() => importPaths([DROP], "app").catch((e) => log(e.message)), 600); });
  server.listen(PORT, "127.0.0.1", () => {
    log(`BLKGRLCO Edit → http://localhost:${PORT}`);
    log(`editing ${store.file} (rev ${store.rev})`);
    watchOnline();
    syncEngine();
    pumpExports(); // resume anything queued before a restart
  });
}

function onFileChange() {
  const { entry, error } = store.externalChange();
  if (error) { broadcast({ type: "file-error", message: error }); log(error); return; }
  if (entry) { log(`claude → rev ${entry.rev}: ${entry.changes.map((c) => c.text).join("; ")}`); announce(entry); }
}

start();
