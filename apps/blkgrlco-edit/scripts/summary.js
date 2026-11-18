#!/usr/bin/env node
// Print a readable summary of a timeline.json and check it the way the app does.
// Usage: node scripts/summary.js [path/to/timeline.json]   (default: project/timeline.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, clipDuration, timelineDuration } from "../server/timeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(here, "..", "project", "timeline.json"));
const fmt = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

let tl;
try { tl = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {
  console.error(`✗ ${file}: ${e.message}`);
  process.exit(1);
}
const { errors, warnings } = validate(tl);
const media = new Map((tl.media || []).map((m) => [m.id, m]));
console.log(`${tl.project?.name} · ${tl.project?.width}×${tl.project?.height} @ ${tl.project?.fps} fps · length ${fmt(timelineDuration(tl))} · nextId ${tl.nextId}`);
for (const t of [...(tl.tracks || [])].reverse()) {
  console.log(`\n${t.id} ${t.kind.toUpperCase()} "${t.name}"${t.muted ? " [muted]" : ""}${t.hidden ? " [hidden]" : ""}`);
  for (const c of [...t.clips].sort((a, b) => a.start - b.start)) {
    const d = clipDuration(c);
    const what = c.text !== undefined ? `"${c.text}"` : `${media.get(c.media)?.file ?? c.media} [${c.in}–${c.out}]`;
    const extras = [c.volume !== undefined && c.volume !== 1 ? `vol ${c.volume}` : "", c.fadeIn ? `fadeIn ${c.fadeIn}` : "", c.fadeOut ? `fadeOut ${c.fadeOut}` : ""].filter(Boolean).join(", ");
    console.log(`  ${c.id.padEnd(5)} ${fmt(c.start)}–${fmt(c.start + d)} (${d.toFixed(2)}s)  ${what}${extras ? `  · ${extras}` : ""}`);
  }
}
console.log(`\nmedia: ${(tl.media || []).map((m) => `${m.id}=${m.file}${m.duration ? ` (${m.duration}s)` : ""}`).join(", ") || "none"}`);
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(errors.length ? "\n✗ the app will NOT accept this file" : "\n✓ valid");
process.exit(errors.length ? 1 : 0);
