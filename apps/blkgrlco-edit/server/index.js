// BLKGRLCO Edit server.
// - project/timeline.json is the single source of truth.
// - Browser edits arrive as PUT /api/timeline and get written to the file (author: "you").
// - Any other change to the file (Claude Code, a text editor) is picked up by the watcher
//   and pushed to every browser over WebSocket (author: "claude").
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { emptyTimeline, validate, normalize, diffTimelines } from "./timeline.js";
import { MediaLibrary } from "./media.js";
import { loadFonts } from "./fonts.js";
import { runExport } from "./export.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const DEV = argv.includes("--dev");
const PORT = Number(flag("port", process.env.PORT || 5310));
const PROJECT = path.resolve(flag("project", path.join(appDir, "project")));
const TL_FILE = path.join(PROJECT, "timeline.json");
const ACTIVITY_FILE = path.join(PROJECT, "activity.jsonl");
const EXPORTS = path.join(PROJECT, "exports");
const WORK = path.join(PROJECT, ".cache", "work");
for (const d of [PROJECT, EXPORTS, WORK, path.join(PROJECT, "fonts")]) fs.mkdirSync(d, { recursive: true });

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

// ------------------------------------------------------------------ state
let timeline = null; // last good, normalized
let revision = 0;
let fileError = null; // set while timeline.json on disk is broken
let warnings = [];
let lastWrittenHash = null;
const activity = [];
const library = new MediaLibrary(PROJECT, { log });
let fonts = loadFonts(PROJECT);

function loadActivity() {
  if (!fs.existsSync(ACTIVITY_FILE)) return;
  const lines = fs.readFileSync(ACTIVITY_FILE, "utf8").trim().split("\n").filter(Boolean).slice(-300);
  for (const l of lines) { try { activity.push(JSON.parse(l)); } catch { /* skip */ } }
}

function record(author, changes) {
  if (!changes.length) return null;
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), author, revision, changes };
  activity.push(entry);
  if (activity.length > 300) activity.shift();
  fs.appendFileSync(ACTIVITY_FILE, JSON.stringify(entry) + "\n");
  return entry;
}

function writeTimeline(tl) {
  const text = JSON.stringify(tl, null, 2) + "\n";
  const tmp = TL_FILE + ".tmp";
  fs.writeFileSync(tmp, text);
  lastWrittenHash = sha(text);
  fs.renameSync(tmp, TL_FILE);
}

/** Apply a new timeline from any source. Returns { ok, status, body }. */
function commit(next, author) {
  const { errors, warnings: w } = validate(next);
  if (errors.length) return { ok: false, errors, warnings: w };
  const norm = normalize(next);
  const changes = diffTimelines(timeline, norm);
  timeline = norm;
  warnings = w;
  revision++;
  fileError = null;
  const entry = record(author, changes);
  broadcast({ type: "timeline", timeline, revision, warnings, author, entry });
  return { ok: true, entry };
}

function boot() {
  loadActivity();
  if (!fs.existsSync(TL_FILE)) {
    const tl = emptyTimeline(path.basename(path.dirname(TL_FILE)) === "project" ? "Untitled" : path.basename(PROJECT));
    writeTimeline(tl);
    log(`created ${TL_FILE}`);
  }
  const text = fs.readFileSync(TL_FILE, "utf8");
  lastWrittenHash = sha(text);
  try {
    const tl = JSON.parse(text);
    const { errors, warnings: w } = validate(tl);
    if (errors.length) throw new Error(errors.join("\n"));
    timeline = normalize(tl);
    warnings = w;
    revision = 1;
  } catch (e) {
    fileError = `timeline.json can't be used: ${e.message}`;
    timeline = emptyTimeline();
    revision = 1;
    log(fileError);
  }
}

// --------------------------------------------------------- file watching
function onFileChange() {
  let text;
  try { text = fs.readFileSync(TL_FILE, "utf8"); } catch { return; }
  const h = sha(text);
  if (h === lastWrittenHash) return; // our own write
  lastWrittenHash = h;
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    fileError = `timeline.json isn't valid JSON (${e.message}). Showing the last good version.`;
    broadcast({ type: "file-error", message: fileError });
    log(fileError);
    return;
  }
  const res = commit(parsed, "claude");
  if (!res.ok) {
    fileError = `timeline.json has problems, so the last good version is still showing:\n${res.errors.join("\n")}`;
    broadcast({ type: "file-error", message: fileError });
    log(fileError);
  } else {
    log(`external edit → revision ${revision}: ${res.entry?.changes.map((c) => c.text).join("; ") || "no visible change"}`);
  }
}

// ------------------------------------------------------------- media
function mediaStates() {
  return Object.fromEntries((timeline?.media || []).map((m) => [m.id, library.proxyState(m)]));
}

function warmMedia(m) {
  library.thumbnail(m).then(() => broadcast({ type: "media-asset", id: m.id, asset: "thumb" })).catch((e) => log(`thumb ${m.file}: ${e.message.split("\n")[0]}`));
  if (m.type !== "image" && (m.type === "audio" || m.hasAudio))
    library.waveform(m).then(() => broadcast({ type: "media-asset", id: m.id, asset: "wave" })).catch(() => {});
  if (m.type === "video")
    library.proxy(m, (mm, state) => broadcast({ type: "media-status", id: mm.id, state })).catch((e) => log(`proxy ${m.file}: ${e.message.split("\n")[0]}`));
}

let scanning = null;
async function scanMedia() {
  if (scanning) return scanning;
  scanning = (async () => {
    const base = structuredClone(timeline);
    let n = base.media.reduce((mx, m) => Math.max(mx, Number(/^m(\d+)$/.exec(m.id)?.[1] || 0)), 0);
    const fresh = await library.scan(base.media, () => `m${++n}`);
    // Drop library entries whose file is gone, unless a clip still uses them.
    const files = new Set(library.listFiles());
    const used = new Set(base.tracks.flatMap((t) => t.clips.map((c) => c.media)).filter(Boolean));
    const kept = base.media.filter((m) => files.has(m.file) || used.has(m.id));
    if (!fresh.length && kept.length === base.media.length) return { added: 0 };
    base.media = [...kept, ...fresh];
    const res = commit(base, "app");
    if (res.ok) writeTimeline(timeline);
    for (const m of fresh) warmMedia(m);
    return { added: fresh.length };
  })().finally(() => { scanning = null; });
  return scanning;
}

// ------------------------------------------------------------- server
const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/api/state", (_req, res) => {
  res.json({
    timeline, revision, warnings, fileError,
    activity: activity.slice(-150),
    fonts: [...fonts.values()].map((f) => ({ key: f.key, source: f.source })),
    mediaStates: mediaStates(),
    projectDir: PROJECT,
  });
});

app.put("/api/timeline", (req, res) => {
  const { timeline: next, baseRevision } = req.body || {};
  if (baseRevision !== revision) return res.status(409).json({ error: "The timeline changed while you were editing. Reloaded the latest version.", timeline, revision });
  const r = commit(next, "you");
  if (!r.ok) return res.status(400).json({ error: r.errors.join("\n") });
  writeTimeline(timeline);
  res.json({ revision, entry: r.entry });
});

app.post("/api/scan", async (_req, res) => {
  try { res.json(await scanMedia()); } catch (e) { res.status(500).json({ error: e.message }); }
});

const byId = (id) => timeline.media.find((m) => m.id === id);
const sendOr404 = (res, p) => (p && fs.existsSync(p) ? res.sendFile(p) : res.status(404).end());

app.get("/api/thumb/:id", async (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).end();
  try { sendOr404(res, await library.thumbnail(m)); } catch { res.status(404).end(); }
});
app.get("/api/wave/:id", async (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).end();
  try { sendOr404(res, await library.waveform(m)); } catch { res.status(404).end(); }
});
// What the browser plays: an H.264 proxy for video, the original for audio and images.
app.get("/api/play/:id", async (req, res) => {
  const m = byId(req.params.id);
  if (!m) return res.status(404).end();
  try {
    if (m.type === "video") return sendOr404(res, await library.proxy(m, (mm, state) => broadcast({ type: "media-status", id: mm.id, state })));
    return sendOr404(res, library.abs(m.file));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/font/:key", (req, res) => {
  const f = fonts.get(req.params.key);
  return f ? res.sendFile(f.file) : res.status(404).end();
});
app.post("/api/fonts/reload", (_req, res) => {
  fonts = loadFonts(PROJECT);
  res.json({ fonts: [...fonts.values()].map((f) => ({ key: f.key, source: f.source })) });
});

let exporting = null;
app.post("/api/export", (_req, res) => {
  if (exporting) return res.status(409).json({ error: "An export is already running." });
  const name = (timeline.project.name || "export").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "export";
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const outFile = path.join(EXPORTS, `${name}-${stamp}.mp4`);
  const snapshot = structuredClone(timeline);
  broadcast({ type: "export", state: "running", progress: 0 });
  exporting = runExport(snapshot, { mediaAbs: (m) => library.abs(m.file), fonts, workDir: WORK, outFile },
    (p) => broadcast({ type: "export", state: "running", progress: p }))
    .then((f) => {
      const rel = path.basename(f);
      record("app", [{ kind: "export", text: `exported ${rel}` }]);
      broadcast({ type: "export", state: "done", file: rel, url: `/exports/${encodeURIComponent(rel)}` });
      log(`exported ${f}`);
    })
    .catch((e) => { broadcast({ type: "export", state: "error", error: e.message }); log(`export failed: ${e.message}`); })
    .finally(() => { exporting = null; });
  res.json({ started: true, file: path.basename(outFile) });
});
app.use("/exports", express.static(EXPORTS));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
wss.on("connection", (ws) => ws.send(JSON.stringify({ type: "hello", revision })));

async function start() {
  boot();
  if (DEV) {
    const { createServer } = await import("vite");
    const vite = await createServer({ root: appDir, server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(appDir, "dist");
    if (!fs.existsSync(dist)) { console.error("No build yet. Run `npm run build` (or `npm start`)."); process.exit(1); }
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  chokidar.watch(TL_FILE, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 } })
    .on("add", onFileChange).on("change", onFileChange);
  let mediaTimer;
  chokidar.watch(library.dir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 }, ignored: (p) => path.basename(p).startsWith(".") })
    .on("all", () => { clearTimeout(mediaTimer); mediaTimer = setTimeout(() => scanMedia().catch((e) => log(e.message)), 500); });

  server.listen(PORT, "127.0.0.1", () => {
    log(`BLKGRLCO Edit → http://localhost:${PORT}`);
    log(`editing ${TL_FILE}`);
    scanMedia().catch((e) => log(`scan: ${e.message}`));
    for (const m of timeline.media) warmMedia(m);
  });
}
start();
