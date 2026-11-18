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
import { MediaLibrary } from "./media";
import { loadFonts } from "./fonts";
import { runExport } from "./export";
import { activeSeq, type Media } from "../shared/model";
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
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));
}
takeLock();
// A crash should restart cleanly (the supervisor relaunches us), never limp on with bad state.
process.on("uncaughtException", (e) => { console.error("crash:", e); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("crash:", e); process.exit(1); });

// ------------------------------------------------------------------ state
const store = new Store(PROJECT);
store.boot();
for (const n of store.bootNotes) log(n);
const library = new MediaLibrary(PROJECT, log);
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
  for (const m of store.tl.media) warm(m);
}
function setPresence(author: Author, message: string, ms: number) {
  presence = { author, message, until: Date.now() + ms };
  broadcast({ type: "presence", presence });
}

// ------------------------------------------------------------------ media
const mediaStates = () => Object.fromEntries(store.tl.media.map((m) => [m.id, library.proxyState(m)]));
const warmed = new Set<string>();
function warm(m: Media) {
  if (warmed.has(m.path)) return;
  warmed.add(m.path);
  if (m.type !== "audio") library.thumbnail(m).then(() => broadcast({ type: "media-asset", id: m.id })).catch((e) => log(`thumbnail ${m.path}: ${String(e.message).split("\n")[0]}`));
  if (m.type === "audio" || m.hasAudio) library.waveform(m).then(() => broadcast({ type: "media-asset", id: m.id })).catch(() => {});
  if (m.type === "video") library.proxy(m, (mm, state) => broadcast({ type: "media-status", id: (mm as Media).id, state })).catch((e) => log(`proxy ${m.path}: ${String(e.message).split("\n")[0]}`));
}

/** Add files (or every media file inside folders) by absolute path. Nothing is copied. */
async function importPaths(paths: string[], author: Author) {
  const files: string[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const p of paths) {
    const abs = path.resolve(p);
    let st: fs.Stats;
    try { st = fs.statSync(abs); } catch { failed.push({ path: abs, error: "file not found" }); continue; }
    if (st.isDirectory()) files.push(...MediaLibrary.walk(abs));
    else files.push(abs);
  }
  const have = new Set(store.tl.media.map((m) => m.path));
  const fresh = [...new Set(files)].filter((f) => !have.has(f));
  const entries: Media[] = [];
  let n = store.tl.media.reduce((mx, m) => Math.max(mx, Number(/^m(\d+)$/.exec(m.id)?.[1] || 0)), 0);
  for (const f of fresh) {
    try { entries.push({ id: `m${++n}`, ...(await library.describe(f)) }); }
    catch (e) { failed.push({ path: f, error: String((e as Error).message).split("\n")[0] }); }
  }
  let entry: Entry | null = null;
  if (entries.length) {
    entry = store.applyEdit(entries.map((value): Op => ({ t: "addMedia", value })), author).entry;
    announce(entry);
  }
  return { added: entries.map((e) => e.id), skipped: files.length - fresh.length, failed };
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
    mediaStates: mediaStates(), presence: presence && presence.until > Date.now() ? presence : null, projectDir: PROJECT,
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
const send = (res: express.Response, p?: string) => (p && fs.existsSync(p) ? res.sendFile(p) : res.status(404).end());
app.get("/api/thumb/:id", async (req, res) => { const m = byId(req.params.id); if (!m) return res.status(404).end(); try { send(res, await library.thumbnail(m)); } catch { res.status(404).end(); } });
app.get("/api/wave/:id", async (req, res) => { const m = byId(req.params.id); if (!m) return res.status(404).end(); try { send(res, await library.waveform(m)); } catch { res.status(404).end(); } });
// Streams with HTTP range requests (sendFile handles Range), so seeking never downloads the file.
app.get("/api/play/:id", async (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).end();
  try {
    if (m.type === "video") return send(res, await library.proxy(m, (mm, state) => broadcast({ type: "media-status", id: (mm as Media).id, state })));
    return send(res, m.path);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
app.get("/api/font/:key", (req, res) => { const f = fonts.get(req.params.key); return f ? res.sendFile(f.file) : res.status(404).end(); });
app.post("/api/fonts/reload", (_req, res) => { fonts = loadFonts(PROJECT); res.json({ fonts: [...fonts.values()].map((f) => ({ key: f.key, source: f.source })) }); });

let exporting: Promise<void> | null = null;
app.post("/api/export", (_req, res) => {
  if (exporting) return res.status(409).json({ error: "An export is already running." });
  const seq = activeSeq(store.tl);
  const name = `${store.tl.project.name}-${seq.name}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "export";
  const outFile = path.join(EXPORTS, `${name}-${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}.mp4`);
  const snapshot = structuredClone(store.tl);
  broadcast({ type: "export", state: "running", progress: 0 });
  exporting = runExport(snapshot, activeSeq(snapshot), { fonts, workDir: WORK, outFile }, (p) => broadcast({ type: "export", state: "running", progress: p }))
    .then((f) => { broadcast({ type: "export", state: "done", file: path.basename(f), url: `/exports/${encodeURIComponent(path.basename(f))}` }); log(`exported ${f}`); })
    .catch((e) => { broadcast({ type: "export", state: "error", error: e.message }); log(`export failed: ${e.message}`); })
    .finally(() => { exporting = null; });
  res.json({ started: true, file: path.basename(outFile) });
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
    for (const m of store.tl.media) warm(m);
  });
}

function onFileChange() {
  const { entry, error } = store.externalChange();
  if (error) { broadcast({ type: "file-error", message: error }); log(error); return; }
  if (entry) { log(`claude → rev ${entry.rev}: ${entry.changes.map((c) => c.text).join("; ")}`); announce(entry); }
}

start();
