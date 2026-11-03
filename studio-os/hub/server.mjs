// BLKGRLCO Studio OS hub: http://localhost:4000
// A tiny local server (Node 18+, no npm packages). It serves the hub page and a
// status API, and checks each tool from this Mac. It only listens on 127.0.0.1.
//
//   GET  /api/status     every tool's up/down, disk use, missing keys
//   GET  /api/health     the hub itself
//   POST /api/open/:id   open a desktop app (VoiceStudio, AppFlowy, OpenWhispr, Cap)

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = path.resolve(HUB_DIR, "..");
const PORT = Number(process.env.HUB_PORT || 4000);
const HOST = "127.0.0.1";
const IS_MAC = platform() === "darwin";
const REGISTRY = JSON.parse(readFileSync(path.join(HUB_DIR, "tools.json"), "utf8"));

// ── small helpers ────────────────────────────────────────────────────────────

const run = (cmd, args, { timeout = 8000, cwd = STUDIO_DIR } = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout, cwd, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` } },
      (err, stdout) => resolve(err ? null : String(stdout)));
  });

// Parse .env without ever sending a value to the browser: we only report whether a key is set.
function readEnv() {
  const file = path.join(STUDIO_DIR, ".env");
  const env = {};
  if (!existsSync(file)) return { exists: false, env };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, i).trim()] = v;
  }
  return { exists: true, env };
}

async function probe(url, timeoutMs = 4000) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const up = res.status < 400 || res.status === 401 || res.status === 403;
    return { up, code: res.status, ms: Date.now() - started };
  } catch (e) {
    return { up: false, code: 0, ms: Date.now() - started, error: e.name === "TimeoutError" ? "timed out" : "not answering" };
  }
}

const appBundle = (name) =>
  [path.join("/Applications", `${name}.app`), path.join(homedir(), "Applications", `${name}.app`)].find((p) => existsSync(p));

async function appRunning(name) {
  if (!IS_MAC) return false;
  const out = await run("pgrep", ["-f", `${name}.app/Contents/MacOS/`], { timeout: 3000 });
  return Boolean(out && out.trim());
}

// ── status ───────────────────────────────────────────────────────────────────

function videoVariant(env) {
  const profiles = `,${env.COMPOSE_PROFILES || "open-higgsfield"},`;
  return profiles.includes(",open-generative-ai,") ? "open-generative-ai" : "open-higgsfield";
}

async function dockerState() {
  const out = await run("docker", ["compose", "ps", "-a", "--format", "json"], { timeout: 8000 });
  if (out === null) {
    const info = await run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 4000 });
    return { running: Boolean(info && info.trim()), containers: [] };
  }
  // Compose prints either one JSON array or one JSON object per line, depending on version.
  let rows = [];
  const text = out.trim();
  if (text.startsWith("[")) rows = JSON.parse(text);
  else rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return {
    running: true,
    containers: rows.map((r) => ({ service: r.Service, state: r.State, status: r.Status, health: r.Health || "" })),
  };
}

async function toolStatus(tool, env, docker) {
  const disabled = `,${(env.STUDIO_DISABLED || "").replace(/\s/g, "")},`.includes(`,${tool.id},`);
  let t = { ...tool };
  if (tool.variants) t = { ...t, ...tool.variants[videoVariant(env)] };
  const base = { id: t.id, name: t.name, tab: t.tab, kind: t.kind, replaces: t.replaces, description: t.description, url: t.url || null, order: t.order };

  if (disabled) return { ...base, status: "off", detail: "Turned off in STUDIO_DISABLED" };

  if (t.kind === "docker") {
    const p = await probe(t.health);
    const containers = docker.containers.filter((c) => t.services.includes(c.service));
    const created = containers.length > 0;
    if (p.up) return { ...base, status: "up", detail: `Answering in ${p.ms} ms`, containers };
    if (!docker.running) return { ...base, status: "down", detail: "Docker Desktop isn't running", containers };
    if (!created) return { ...base, status: "down", detail: "Not started. Run ./start.sh", containers };
    const starting = containers.some((c) => /starting|restarting|created/i.test(`${c.state} ${c.health} ${c.status}`));
    return { ...base, status: starting ? "starting" : "down", detail: starting ? "Starting up…" : `Not answering (${p.error || `HTTP ${p.code}`})`, containers };
  }

  // desktop app
  const bundle = appBundle(t.app);
  if (!IS_MAC) return { ...base, status: "unknown", detail: "Desktop apps are checked on macOS only" };
  if (!bundle) return { ...base, status: "missing", detail: `Not installed. Run ./install.sh ${t.id}` };
  const running = await appRunning(t.app);
  if (t.health) {
    const p = await probe(t.health, 2500);
    if (running && p.up) return { ...base, status: "up", detail: "Open, engine ready" };
    if (running) return { ...base, status: "starting", detail: "Open, engine still loading" };
  }
  return running ? { ...base, status: "up", detail: "Open" } : { ...base, status: "closed", detail: "Installed, not open" };
}

async function diskStatus() {
  const out = await run("df", ["-Pk", homedir()], { timeout: 4000 });
  let disk = null;
  if (out) {
    const cols = out.trim().split("\n")[1].split(/\s+/);
    const total = Number(cols[1]) * 1024, used = Number(cols[2]) * 1024, free = Number(cols[3]) * 1024;
    disk = { total, used, free, pct: Math.round((used / (used + free)) * 100) };
  }
  let docker = null;
  const dfOut = await run("docker", ["system", "df", "--format", "{{json .}}"], { timeout: 10000 });
  if (dfOut) {
    docker = dfOut.trim().split("\n").filter(Boolean).map((l) => {
      const r = JSON.parse(l);
      return { type: r.Type, size: r.Size, reclaimable: r.Reclaimable, count: r.TotalCount };
    });
  }
  let backups = null;
  const bdir = path.join(STUDIO_DIR, "backups");
  if (existsSync(bdir)) {
    const du = await run("du", ["-sk", bdir], { timeout: 8000 });
    const ls = await run("ls", ["-1", bdir], { timeout: 2000 });
    const names = (ls || "").trim().split("\n").filter(Boolean).sort();
    backups = { size: du ? Number(du.split(/\s/)[0]) * 1024 : null, count: names.length, latest: names.at(-1) || null };
  }
  return { disk, docker, backups };
}

function keyStatus(env, envExists) {
  const variant = videoVariant(env);
  const keys = REGISTRY.keys
    .filter((k) => !k.variant || k.variant === variant)
    .map((k) => {
      const tool = REGISTRY.tools.find((t) => t.id === k.tool);
      return { name: k.name, tool: tool ? tool.name : k.tool, need: k.need, where: k.where, cost: k.cost, get: k.get, set: Boolean(env[k.name]) };
    });
  const generated = REGISTRY.generated.map((name) => ({ name, set: Boolean(env[name]) }));
  return { envExists, keys, generated };
}

let cache = { at: 0, data: null, pending: null };
async function status() {
  if (cache.data && Date.now() - cache.at < 4000) return cache.data;
  if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    const { exists, env } = readEnv();
    const docker = await dockerState();
    const [tools, storage] = await Promise.all([
      Promise.all(REGISTRY.tools.map((t) => toolStatus(t, env, docker))),
      diskStatus(),
    ]);
    const data = {
      generatedAt: new Date().toISOString(),
      videoTool: videoVariant(env),
      tools: tools.sort((a, b) => a.order - b.order),
      docker: { running: docker.running, containers: docker.containers },
      storage,
      keys: keyStatus(env, exists),
      publicTunnel: `,${env.COMPOSE_PROFILES || ""},`.includes(",public,"),
    };
    cache = { at: Date.now(), data, pending: null };
    return data;
  })().catch((e) => { cache.pending = null; throw e; });
  return cache.pending;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Only this page may trigger actions (blocks other websites from poking localhost).
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/status") return send(res, 200, await status());

    const open = url.pathname.match(/^\/api\/open\/([a-z]+)$/);
    if (req.method === "POST" && open) {
      if (!sameOrigin(req)) return send(res, 403, { error: "forbidden" });
      const tool = REGISTRY.tools.find((t) => t.id === open[1] && t.kind === "desktop");
      if (!tool) return send(res, 404, { error: "unknown app" });
      if (!IS_MAC) return send(res, 501, { error: "Opening apps works on macOS only" });
      if (!appBundle(tool.app)) return send(res, 409, { error: `${tool.app} isn't installed. Run ./install.sh ${tool.id}` });
      const ok = await run("open", ["-a", tool.app], { timeout: 5000 });
      cache.at = 0;
      return send(res, ok === null ? 500 : 200, ok === null ? { error: `Couldn't open ${tool.app}` } : { ok: true });
    }

    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(HUB_DIR, "public", rel);
    if (!file.startsWith(path.join(HUB_DIR, "public") + path.sep)) return send(res, 404, "Not found", "text/plain");
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) return send(res, 404, "Not found", "text/plain");
    return send(res, 200, await readFile(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    console.error(new Date().toISOString(), e);
    return send(res, 500, { error: "hub error" });
  }
});

server.listen(PORT, HOST, () => console.log(`${new Date().toISOString()} Studio OS hub on http://localhost:${PORT}`));
