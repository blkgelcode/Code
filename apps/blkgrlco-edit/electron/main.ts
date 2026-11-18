// BLKGRLCO Edit — the Mac app shell.
// Runs the Node server as a supervised child process (restarted automatically if it crashes),
// opens the editor in a window, and gives the page what a browser can't: real file paths
// from the native pickers and from Finder drag-and-drop, plus native menus.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "..");
const SERVER = path.join(APP_DIR, "dist-server", "server.mjs");
const CONFIG = path.join(app.getPath("userData"), "config.json");
const LOG_DIR = path.join(app.getPath("userData"), "logs");
const MEDIA_EXT = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "mts", "mxf", "wav", "mp3", "m4a", "aac", "flac", "ogg", "aif", "aiff", "jpg", "jpeg", "png", "webp", "heic", "gif"];

let win: BrowserWindow | null = null;
let server: ChildProcess | null = null;
let port = 5310;
let quitting = false;
let restarts: number[] = [];

const readConfig = (): { project?: string } => { try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return {}; } };
const writeConfig = (c: object) => { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); };
// Project folder: --project <dir>, else the last one opened, else the app's own project/ folder.
const argProject = (() => { const i = process.argv.indexOf("--project"); return i >= 0 ? process.argv[i + 1] : undefined; })();
let project = path.resolve(argProject || process.env.BLKEDIT_PROJECT || readConfig().project || path.join(APP_DIR, "project"));

function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => { const t = net.createServer(); t.listen(0, "127.0.0.1", () => { const p = (t.address() as net.AddressInfo).port; t.close(() => resolve(p)); }); });
    s.listen(preferred, "127.0.0.1", () => s.close(() => resolve(preferred)));
  });
}

async function waitForServer(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/state`); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function startServer() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const log = fs.createWriteStream(path.join(LOG_DIR, "server.log"), { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} starting (project ${project}) ---\n`);
  // ELECTRON_RUN_AS_NODE makes Electron's own binary act as plain Node: no separate install needed.
  server = spawn(process.execPath, [SERVER, "--port", String(port), "--project", project], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => { log.write(d); process.stdout.write(d); });
  server.stderr?.on("data", (d) => { log.write(d); process.stderr.write(d); });
  server.on("exit", (code) => {
    server = null;
    if (quitting) return;
    if (code === 3) {
      dialog.showErrorBox("Project already open", `${project}\n\nis already open in another BLKGRLCO Edit window or server. Close that one, then reopen.`);
      return app.quit();
    }
    // Crash: restart (the page reconnects by itself). Give up after 5 crashes in a minute.
    const now = Date.now();
    restarts = restarts.filter((t) => now - t < 60000).concat(now);
    if (restarts.length > 5) {
      dialog.showErrorBox("The editing server keeps stopping", `See ${path.join(LOG_DIR, "server.log")}. Your edits up to the last change are saved in timeline.json.`);
      return;
    }
    setTimeout(startServer, 500 * restarts.length);
  });
}

async function openProject(dir: string) {
  project = dir;
  writeConfig({ ...readConfig(), project: dir });
  if (server) { server.removeAllListeners("exit"); server.kill(); await new Promise((r) => setTimeout(r, 400)); server = null; }
  startServer();
  if (await waitForServer()) win?.loadURL(`http://127.0.0.1:${port}/`);
  win?.setTitle(`BLKGRLCO Edit — ${path.basename(dir)}`);
}

const send = (action: string) => win?.webContents.send("menu", action);

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "Import Files…", accelerator: "CmdOrCtrl+I", click: () => send("import") },
        { label: "Import Folder…", accelerator: "Shift+CmdOrCtrl+I", click: () => send("import-folder") },
        { type: "separator" },
        { label: "Open Project Folder…", accelerator: "CmdOrCtrl+O", click: async () => {
          const r = await dialog.showOpenDialog(win!, { title: "Choose a project folder (timeline.json lives here)", properties: ["openDirectory", "createDirectory"] });
          if (!r.canceled && r.filePaths[0]) openProject(r.filePaths[0]);
        } },
        { label: "Show Project in Finder", click: () => shell.openPath(project) },
        { label: "Show timeline.json in Finder", click: () => shell.showItemInFolder(path.join(project, "timeline.json")) },
        { type: "separator" },
        { label: "Export MP4", accelerator: "CmdOrCtrl+E", click: () => send("export") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        // The page decides: text field → undo typing; otherwise → undo your last timeline change.
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", click: () => send("redo") },
        { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { label: "Select All", accelerator: "CmdOrCtrl+A", click: () => send("select-all") },
        { type: "separator" },
        { label: "Command Palette…", click: () => send("palette") },
        { label: "Keyboard Shortcuts…", click: () => send("shortcuts") },
      ],
    },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("pick-media", async () => {
  const r = await dialog.showOpenDialog(win!, { title: "Import media (used in place, never copied)", properties: ["openFile", "multiSelections"], filters: [{ name: "Media", extensions: MEDIA_EXT }, { name: "All files", extensions: ["*"] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("reveal", (_e, p: string) => { if (typeof p === "string" && p.startsWith(project)) shell.showItemInFolder(p); });
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(win!, { title: "Import every clip in a folder", properties: ["openDirectory", "multiSelections"] });
  return r.canceled ? [] : r.filePaths;
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    buildMenu();
    port = await freePort(Number(process.env.PORT) || 5310);
    startServer();
    win = new BrowserWindow({
      width: 1600, height: 1000, minWidth: 1100, minHeight: 700, backgroundColor: "#1a0e04",
      title: `BLKGRLCO Edit — ${path.basename(project)}`,
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    // Links (e.g. a finished export) open in the default browser/Finder, not inside the editor.
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
    if (await waitForServer()) win.loadURL(`http://127.0.0.1:${port}/`);
    else win.loadURL(`data:text/html,<body style="background:#1a0e04;color:#F0DAC2;font:15px sans-serif;padding:40px">The editing server didn't start. See ${encodeURIComponent(path.join(LOG_DIR, "server.log"))}</body>`);
  });
  app.on("before-quit", () => { quitting = true; server?.kill(); });
  app.on("window-all-closed", () => app.quit());
}
