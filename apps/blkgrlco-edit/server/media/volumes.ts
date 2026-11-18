// External drives: which volume a file lives on, and where that volume is mounted now.
// macOS mounts drives under /Volumes/<name>; the same drive can come back as "Untitled 1",
// so drives are identified by their volume UUID (from `diskutil`), not their name.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Tests point this at a temp folder and identify "drives" by a .volume-uuid file in their root.
const ROOT = process.env.BLKEDIT_VOLUMES_ROOT || "/Volumes";
const FAKE = !!process.env.BLKEDIT_VOLUMES_ROOT || process.platform !== "darwin";

export interface VolumeRef { uuid: string; name: string; rel: string }

const uuidCache = new Map<string, string | null>();
function uuidOf(mount: string): string | null {
  if (uuidCache.has(mount)) return uuidCache.get(mount)!;
  let uuid: string | null = null;
  try {
    if (FAKE) uuid = fs.readFileSync(path.join(mount, ".volume-uuid"), "utf8").trim() || null;
    else {
      const plist = execFileSync("diskutil", ["info", "-plist", mount], { encoding: "utf8", timeout: 5000 });
      uuid = /<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] || null;
    }
  } catch { uuid = null; }
  if (uuid) uuidCache.set(mount, uuid);
  return uuid;
}

/** The volume a file is on, if it's an external drive (else null: internal disk paths don't move). */
export function volumeOf(file: string): VolumeRef | null {
  const abs = path.resolve(file);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  const name = abs.slice(ROOT.length + 1).split(path.sep)[0];
  const mount = path.join(ROOT, name);
  const uuid = uuidOf(mount);
  return uuid ? { uuid, name, rel: path.relative(mount, abs) } : null;
}

/** Currently mounted volumes: uuid → mount point. */
export function mounted(): Map<string, string> {
  const out = new Map<string, string>();
  let names: string[] = [];
  try { names = fs.readdirSync(ROOT); } catch { return out; }
  for (const n of names) {
    const mount = path.join(ROOT, n);
    try { if (!fs.statSync(mount).isDirectory()) continue; } catch { continue; }
    uuidCache.delete(mount); // a remount can reuse a name for a different drive
    const u = uuidOf(mount);
    if (u) out.set(u, mount);
  }
  return out;
}

export const volumesRoot = ROOT;
