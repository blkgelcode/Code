// Picking files by path. Browsers never give a web page the real path of a file
// you pick or drop, and this app must not upload footage. So:
//   - browse(): the server lists folders on this machine for the Import window.
//   - locate(): for drag-and-drop and the system file picker, the browser sends
//     only names, sizes and dates; the server finds those files on disk.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kindOf } from "./media.js";
import { MEDIA_DIR } from "./store.js";
import { VOLUMES_DIR } from "./library.js";

const run = promisify(execFile);
const recent = []; // folders used for imports recently, searched first

export function rememberFolder(dir) {
  const i = recent.indexOf(dir);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(dir);
  recent.length = Math.min(recent.length, 20);
}

export function places() {
  const home = os.homedir();
  const out = [{ name: "media/ folder", path: MEDIA_DIR }];
  for (const [name, p] of [["Home", home], ["Desktop", path.join(home, "Desktop")], ["Movies", path.join(home, "Movies")], ["Downloads", path.join(home, "Downloads")]]) {
    if (fs.existsSync(p)) out.push({ name, path: p });
  }
  try {
    for (const v of fs.readdirSync(VOLUMES_DIR)) {
      if (v.startsWith(".") || v === "Macintosh HD") continue;
      out.push({ name: v, path: path.join(VOLUMES_DIR, v), drive: true });
    }
  } catch {
    // not a Mac
  }
  return out.concat(recent.slice(0, 5).map((p) => ({ name: path.basename(p), path: p, recent: true })));
}

export function browse(dir) {
  const abs = path.resolve(dir || os.homedir());
  const st = fs.statSync(abs);
  if (!st.isDirectory()) throw new Error("not a folder");
  const entries = [];
  for (const name of fs.readdirSync(abs)) {
    if (name.startsWith(".")) continue;
    const full = path.join(abs, name);
    let s;
    try {
      s = fs.statSync(full);
    } catch {
      continue; // broken link, no permission
    }
    if (s.isDirectory()) entries.push({ name, type: "dir" });
    else if (kindOf(name)) entries.push({ name, type: "file", kind: kindOf(name), size: s.size, mtime: s.mtimeMs });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === "dir" ? -1 : 1));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, entries };
}

// ---- locate: find dropped files on disk by name + size --------------------------------------

function matches(full, want) {
  try {
    const st = fs.statSync(full);
    return st.isFile() && st.size === want.size;
  } catch {
    return false;
  }
}

/** Bounded walk: stops at `depth` levels or when the deadline passes. */
function walkFind(root, wanted, found, deadline, depth = 6) {
  if (Date.now() > deadline || depth < 0 || !wanted.size) return;
  let names;
  try {
    names = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of names) {
    if (d.name.startsWith(".") || Date.now() > deadline) continue;
    const full = path.join(root, d.name);
    if (d.isDirectory()) {
      if (/^(Library|node_modules|System|Applications)$/.test(d.name)) continue;
      walkFind(full, wanted, found, deadline, depth - 1);
    } else if (wanted.has(d.name)) {
      for (const w of wanted.get(d.name)) {
        if (!found.has(w.id) && matches(full, w)) {
          found.set(w.id, full);
          break;
        }
      }
      if (wanted.get(d.name).every((w) => found.has(w.id))) wanted.delete(d.name);
    }
  }
}

async function spotlight(name) {
  if (process.platform !== "darwin") return [];
  try {
    const { stdout } = await run("mdfind", ["-name", name], { timeout: 4000 });
    return stdout.split("\n").filter((p) => path.basename(p) === name);
  } catch {
    return [];
  }
}

/**
 * files: [{ name, size, relPath }] as the browser saw them (relPath = path inside a
 * dropped folder). Returns { found: [absPath], missing: [name] }. If every file of
 * a dropped folder is found in one folder, that folder is returned as well.
 */
export async function locate(files, { budgetMs = 6000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const items = files.filter((f) => kindOf(f.name)).map((f, id) => ({ ...f, id }));
  const found = new Map();
  const wanted = new Map();
  const want = () => {
    wanted.clear();
    for (const w of items) if (!found.has(w.id)) (wanted.get(w.name) || wanted.set(w.name, []).get(w.name)).push(w);
  };

  // 1. folders she's used, and the media folder
  want();
  for (const dir of [...recent, MEDIA_DIR]) walkFind(dir, wanted, found, deadline, 4);
  // 2. Spotlight (fast, but external drives are often not indexed)
  want();
  for (const [name, ws] of wanted) {
    if (Date.now() > deadline) break;
    for (const p of await spotlight(name)) {
      const w = ws.find((x) => !found.has(x.id) && matches(p, x));
      if (w) found.set(w.id, p);
    }
  }
  // 3. a time-limited walk of drives and the usual home folders
  want();
  const home = os.homedir();
  const roots = [];
  try {
    for (const v of fs.readdirSync(VOLUMES_DIR)) if (!v.startsWith(".") && v !== "Macintosh HD") roots.push(path.join(VOLUMES_DIR, v));
  } catch {
    // not a Mac
  }
  roots.push(...["Movies", "Desktop", "Downloads", "Documents", "Pictures"].map((d) => path.join(home, d)));
  for (const r of roots) walkFind(r, wanted, found, deadline, 7);

  const paths = items.filter((w) => found.has(w.id)).map((w) => found.get(w.id));
  for (const p of paths) rememberFolder(path.dirname(p));
  return {
    found: paths,
    missing: items.filter((w) => !found.has(w.id)).map((w) => w.relPath || w.name),
    timedOut: Date.now() > deadline,
  };
}
