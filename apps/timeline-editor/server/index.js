// Local server: serves the app, streams media, watches project/timeline.json, runs
// the background media jobs and keeps every open browser in sync over a WebSocket.
//
//   browser edit  -> {type:"update"} -> store.write()  -> file + activity (author "user")
//   file edited by anyone else (Claude Code) -> watcher -> store.fileChanged() (author "claude")
//   either way    -> {type:"state"} broadcast to every browser
//   media jobs / drive changes -> {type:"media", update} broadcast
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { TimelineStore, readActivity, PROJECT_DIR, MEDIA_DIR, TIMELINE_FILE, EXPORT_DIR, DIST_DIR, LOCK_FILE } from "./store.js";
import { CHANNEL_LOOKS, lutsAvailable } from "./brand.js";
import { importPaths, resolvePath, WAVE_RATE } from "./media.js";
import { MediaLibrary } from "./library.js";
import { browse, places, locate, rememberFolder } from "./browse.js";
import { exportTimeline } from "./export.js";

// A bad file or a failed job must never take the editor down: log and keep going.
process.on("uncaughtException", (e) => console.error("[error]", e?.stack || e));
process.on("unhandledRejection", (e) => console.error("[error]", e?.stack || e));

const PORT = Number(process.env.PORT || 5175);
const store = new TimelineStore();
const app = express();
app.use(express.json({ limit: "5mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg) => wss.clients.forEach((ws) => send(ws, msg));
const library = new MediaLibrary(store, { broadcast });

const stateMsg = (extra = {}) => ({
  type: "state",
  timeline: store.timeline,
  rev: store.rev,
  errors: store.errors,
  warnings: store.warnings,
  history: store.history.status(),
  canRecover: Boolean(store.errors.length && store.history.readHead()),
  ...extra,
});

/** Run an undo/redo/restore action and report the result to one socket or HTTP. */
function act(fn) {
  try {
    const r = fn();
    return { ok: true, ...(r && typeof r === "object" && !Array.isArray(r) ? r : {}) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

store.on((event) => {
  if (event.type === "timeline") {
    broadcast(stateMsg({ author: event.author, entry: event.entry }));
    library.sync().catch(() => {});
  }
  if (event.type === "invalid") broadcast({ type: "invalid", errors: event.errors, rev: store.rev, canRecover: Boolean(store.history.readHead()) });
});

wss.on("connection", (ws) => {
  send(ws, stateMsg({ activity: readActivity() }));
  send(ws, { type: "media", status: library.snapshot() });
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === "update") {
      const r = store.write(msg.timeline, "user", msg.baseRev);
      send(ws, { type: "ack", reqId: msg.reqId, ...r });
      if (!r.ok) send(ws, stateMsg());
    } else if (["undo", "redo", "undoEntry"].includes(msg.type)) {
      const r = act(() => (msg.type === "undo" ? store.undo("user") : msg.type === "redo" ? store.redo("user") : store.undoEntry(msg.seq, "user")));
      if (!r.ok) send(ws, { type: "notice", text: r.error });
    }
  });
});

// ---- file watcher: picks up edits made outside the app ---------------------------------------

chokidar
  .watch(PROJECT_DIR, { depth: 0, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } })
  .on("all", (_event, file) => {
    if (path.resolve(file) === TIMELINE_FILE) store.fileChanged();
  });

// ---- import ---------------------------------------------------------------------------------

const mediaEntry = (id) => store.timeline?.media.find((m) => m.id === id);
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ ok: false, error: e.message }));

app.get("/api/ping", (_req, res) => res.json({ ok: true, projectDir: PROJECT_DIR, pid: process.pid }));

// ---- history, versions, recovery (the `tl` CLI uses these while the app runs) ----------------

const by = (req) => (req.body?.author === "claude" ? "claude" : "user");
app.post("/api/undo", (req, res) => res.json(act(() => (req.body?.seq ? store.undoEntry(Number(req.body.seq), by(req)) : store.undo(by(req))))));
app.post("/api/redo", (req, res) => res.json(act(() => store.redo(by(req)))));
app.get("/api/history", (_req, res) => res.json({ ...store.history.status(), entries: store.history.entries.slice(-50).map((e) => store.history.summary(e)) }));
app.get("/api/versions", (_req, res) => res.json(store.history.listVersions()));
app.post("/api/versions", (req, res) => res.json(act(() => ({ file: store.saveVersion(String(req.body?.name || "Version"), by(req)) }))));
app.post("/api/versions/restore", (req, res) => res.json(act(() => store.restoreVersion(req.body?.id, by(req)))));
app.post("/api/recover", (req, res) => res.json(act(() => store.recover(by(req)))));
app.get("/api/presets", (_req, res) => res.json({
  channels: Object.fromEntries(Object.entries(CHANNEL_LOOKS).map(([k, v]) => [k, v ? { look: v.name } : { look: null }])),
  luts: lutsAvailable(),
}));

app.get("/api/state", (_req, res) => res.json({ ...stateMsg({ activity: readActivity() }), media: library.snapshot(), mediaDir: MEDIA_DIR, projectDir: PROJECT_DIR }));
app.get("/api/places", (_req, res) => res.json(places()));
app.get("/api/browse", wrap((req, res) => res.json(browse(req.query.path))));

/** Import by path: { paths: [file or folder, ...] }. No paths = everything new in media/. */
app.post("/api/import", wrap(async (req, res) => {
  if (!store.timeline) return res.status(409).json({ ok: false, error: "Fix timeline.json first", errors: store.errors });
  const paths = req.body?.paths?.length ? req.body.paths : [MEDIA_DIR];
  for (const p of paths) {
    try {
      rememberFolder(fs.statSync(p).isDirectory() ? p : path.dirname(p));
    } catch {
      // reported as "not found" below
    }
  }
  const { timeline, added, failed, skipped } = await importPaths(store.timeline, paths);
  if (added.length) store.write(timeline, "user");
  res.json({ ok: true, added: added.map((m) => ({ id: m.id, file: m.file })), failed, skipped });
}));

/** Drag-and-drop: { files: [{name, size, relPath}] } -> find them on disk, then import. */
app.post("/api/locate", wrap(async (req, res) => {
  const files = (req.body?.files || []).slice(0, 5000);
  const r = await locate(files);
  res.json({ ok: true, ...r });
}));

app.post("/api/retry/:id", (req, res) => {
  library.retry(req.params.id);
  res.json({ ok: true });
});

// ---- media: thumbnails, waveforms, playback ------------------------------------------------

app.get("/thumb/:id", (req, res) => {
  const p = library.cached(req.params.id, "thumb");
  p ? res.sendFile(p, { maxAge: "1h" }) : res.status(404).end();
});

app.get("/wave/:id", (req, res) => {
  const p = library.cached(req.params.id, "wave");
  p ? res.sendFile(p, { maxAge: "1h" }) : res.status(404).json({ rate: WAVE_RATE, peaks: [] });
});

/**
 * Playback, streamed with HTTP range requests (sendFile handles Range), never
 * read into memory. ?q=proxy (default) plays the proxy; ?q=full plays the
 * original file. Audio the browser can play natively and images have no proxy.
 */
app.get("/preview/:id", (req, res) => {
  const m = mediaEntry(req.params.id);
  if (!m) return res.status(404).end();
  const proxy = library.cached(m.id, "proxy");
  const original = resolvePath(m);
  let file;
  if (req.query.q === "full") file = original;
  else if (proxy) file = proxy;
  else if (m.kind === "video") return res.status(409).json({ error: "proxy not ready" });
  else file = original;
  if (!fs.existsSync(file)) return res.status(410).json({ error: "offline" });
  res.sendFile(file, { acceptRanges: true, headers: { "Cache-Control": "no-cache" } }, (err) => {
    if (err && !res.headersSent) res.status(err.statusCode || 500).end();
  });
});

// ---- export ---------------------------------------------------------------------------------

let exporting = false;
app.post("/api/export", (_req, res) => {
  if (!store.timeline) return res.status(409).json({ ok: false, error: "Fix timeline.json first" });
  if (exporting) return res.status(409).json({ ok: false, error: "An export is already running" });
  const offline = library.offlineInUse();
  if (offline.length) {
    return res.status(409).json({ ok: false, error: `Offline: ${offline.map((m) => `${m.id} (${path.basename(m.file)})`).join(", ")}. Reconnect the drive to export.` });
  }
  exporting = true;
  res.json({ ok: true });
  broadcast({ type: "export", progress: 0 });
  exportTimeline(store.timeline, { hw: library.hw, onProgress: (p) => broadcast({ type: "export", progress: p }) })
    .then((file) => broadcast({ type: "export", progress: 1, done: true, file: path.basename(file), path: file }))
    .catch((e) => broadcast({ type: "export", error: e.message }))
    .finally(() => (exporting = false));
});

app.use("/exports", express.static(EXPORT_DIR));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
}

// tell the `tl` CLI where this server is, and remove the note on the way out
const writeLock = () => fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, port: PORT, projectDir: PROJECT_DIR }));
const dropLock = () => {
  try {
    if (JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")).pid === process.pid) fs.rmSync(LOCK_FILE);
  } catch {
    // already gone
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => {
  dropLock();
  process.exit(0);
});
process.on("exit", dropLock);

server.listen(PORT, "127.0.0.1", async () => {
  writeLock();
  console.log(`timeline server on http://localhost:${PORT}`);
  console.log(`  timeline: ${TIMELINE_FILE}`);
  console.log(`  media:    ${MEDIA_DIR}`);
  if (store.errors.length) console.log(`  timeline.json has errors:\n   - ${store.errors.join("\n   - ")}`);
  await library.start();
});
