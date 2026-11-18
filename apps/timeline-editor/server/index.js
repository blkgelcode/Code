// Local server: serves the app and media, watches project/timeline.json, and keeps
// every open browser in sync over a WebSocket.
//
//   browser edit  -> {type:"update"} -> store.write()  -> file + activity (author "user")
//   file edited by anyone else (Claude Code) -> watcher -> store.fileChanged() (author "claude")
//   either way    -> {type:"state"} broadcast to every browser
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import {
  TimelineStore, readActivity, PROJECT_DIR, MEDIA_DIR, TIMELINE_FILE, EXPORT_DIR, DIST_DIR,
} from "./store.js";
import { importNew, makeProxy, makeThumb, proxyPath, thumbPath, scanMedia } from "./media.js";
import { exportTimeline } from "./export.js";

const PORT = Number(process.env.PORT || 5175);
const store = new TimelineStore();
const app = express();
app.use(express.json({ limit: "20mb" }));

// ---- websocket ------------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg) => wss.clients.forEach((ws) => send(ws, msg));

const proxyStatus = {}; // mediaId -> { ready, progress, error }
const stateMsg = (extra = {}) => ({
  type: "state",
  timeline: store.timeline,
  rev: store.rev,
  errors: store.errors,
  warnings: store.warnings,
  proxies: proxyStatus,
  ...extra,
});

store.on((event) => {
  if (event.type === "timeline") broadcast(stateMsg({ author: event.author, entry: event.entry }));
  if (event.type === "invalid") broadcast({ type: "invalid", errors: event.errors, rev: store.rev });
});

wss.on("connection", (ws) => {
  send(ws, stateMsg({ activity: readActivity() }));
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
    }
  });
});

// ---- file watcher: picks up edits made outside the app ---------------------------------------

chokidar
  .watch(PROJECT_DIR, { depth: 0, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } })
  .on("all", (_event, file) => {
    if (path.resolve(file) === TIMELINE_FILE) {
      store.fileChanged();
      queueProxies();
    }
  });

// ---- preview proxies, one at a time in the background ----------------------------------------

let proxyBusy = false;
async function queueProxies() {
  if (proxyBusy || !store.timeline) return;
  proxyBusy = true;
  try {
    for (const m of store.timeline.media) {
      if (m.kind !== "video") continue;
      if (!fs.existsSync(path.join(MEDIA_DIR, m.file))) {
        proxyStatus[m.id] = { ready: false, error: "file missing from media/" };
        continue;
      }
      if (fs.existsSync(proxyPath(m.file))) {
        proxyStatus[m.id] = { ready: true, progress: 1 };
        continue;
      }
      if (proxyStatus[m.id]?.error) continue;
      proxyStatus[m.id] = { ready: false, progress: 0 };
      broadcast({ type: "proxy", mediaId: m.id, ...proxyStatus[m.id] });
      try {
        await makeProxy(m, (p) => {
          proxyStatus[m.id] = { ready: false, progress: p };
          broadcast({ type: "proxy", mediaId: m.id, ...proxyStatus[m.id] });
        });
        proxyStatus[m.id] = { ready: true, progress: 1 };
      } catch (e) {
        proxyStatus[m.id] = { ready: false, error: e.message };
      }
      broadcast({ type: "proxy", mediaId: m.id, ...proxyStatus[m.id] });
    }
  } finally {
    proxyBusy = false;
  }
}

// ---- http -----------------------------------------------------------------------------------

const mediaEntry = (id) => store.timeline?.media.find((m) => m.id === id);

app.get("/api/state", (_req, res) => res.json({ ...stateMsg({ activity: readActivity() }), mediaDir: MEDIA_DIR, projectDir: PROJECT_DIR }));

app.get("/api/media-files", (_req, res) => {
  const known = new Set(store.timeline?.media.map((m) => m.file) || []);
  res.json(scanMedia().map((file) => ({ file, imported: known.has(file) })));
});

app.post("/api/import", async (_req, res) => {
  if (!store.timeline) return res.status(409).json({ ok: false, error: "Fix timeline.json first", errors: store.errors });
  const { timeline, added, failed } = await importNew(store.timeline);
  if (added.length) store.write(timeline, "user");
  res.json({ ok: true, added, failed });
  queueProxies();
});

app.get("/thumb/:id", async (req, res) => {
  const m = mediaEntry(req.params.id);
  if (!m || m.kind === "audio") return res.status(404).end();
  const p = thumbPath(m.file);
  if (!fs.existsSync(p)) await makeThumb(m).catch(() => {});
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).end();
});

// the browser plays proxies when they're ready, the original otherwise
app.get("/preview/:id", (req, res) => {
  const m = mediaEntry(req.params.id);
  if (!m) return res.status(404).end();
  const proxy = m.kind === "video" ? proxyPath(m.file) : null;
  const file = proxy && fs.existsSync(proxy) ? proxy : path.join(MEDIA_DIR, m.file);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

let exporting = false;
app.post("/api/export", (_req, res) => {
  if (!store.timeline) return res.status(409).json({ ok: false, error: "Fix timeline.json first" });
  if (exporting) return res.status(409).json({ ok: false, error: "An export is already running" });
  exporting = true;
  res.json({ ok: true });
  broadcast({ type: "export", progress: 0 });
  exportTimeline(store.timeline, { onProgress: (p) => broadcast({ type: "export", progress: p }) })
    .then((file) => broadcast({ type: "export", progress: 1, done: true, file: path.basename(file), path: file }))
    .catch((e) => broadcast({ type: "export", error: e.message }))
    .finally(() => (exporting = false));
});

app.use("/exports", express.static(EXPORT_DIR));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`timeline server on http://localhost:${PORT}`);
  console.log(`  timeline: ${TIMELINE_FILE}`);
  console.log(`  media:    ${MEDIA_DIR}`);
  if (store.errors.length) console.log(`  timeline.json has errors:\n   - ${store.errors.join("\n   - ")}`);
  queueProxies();
});
