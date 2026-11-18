#!/usr/bin/env -S npx tsx
// bge — Claude's command line for BLKGRLCO Edit.
//
//   bge summary [--seq s2]        print every clip with its timeline position (works offline)
//   bge check                     validate timeline.json exactly the way the app does
//   bge history [n]               the last n changes (who, what, rev)
//   bge undo | redo               undo/redo Claude's own last change   (--as you: hers)
//   bge revert <rev>              undo one specific change, by anyone, if nothing later depends on it
//   bge restore <rev>             make the timeline match an earlier revision (as a new change)
//   bge status "trimming c3"      show "Claude is trimming c3…" in her app; `bge status` clears it
//   bge import <path…>            add files or folders by path (never copied)
//
// Options: --project <dir> (default ../project), --port <n> (default 5310).
// Talks to the running app when it's up; summary/check/history also work when it isn't.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, migrate, normalize, clipLength, isText, sequenceDuration, mediaName, type Timeline } from "../shared/model";
import { fmtTime } from "../shared/ops";

process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); });
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const project = path.resolve(opt("project") || process.env.BLKEDIT_PROJECT || path.join(here, "..", "project"));
const port = Number(opt("port") || process.env.PORT || 5310);
const as = opt("as") === "you" ? "you" : "claude";
const seqOpt = opt("seq");
const [cmd = "summary", ...rest] = args;
const base = `http://127.0.0.1:${port}`;
const file = path.join(project, "timeline.json");

async function api(method: string, p: string, body?: unknown) {
  let r: Response;
  try { r = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); }
  catch { return null; } // app not running
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`✗ ${j.error || r.statusText}`); process.exit(2); }
  return j;
}
const needApp = (j: unknown) => { if (j === null) { console.error(`✗ The app isn't running on port ${port}. Start it first (Start BLKGRLCO Edit.command).`); process.exit(2); } return j as any; };

function load(): Timeline {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const v = validate(migrate(raw, project).timeline);
  if (!v.ok) { for (const e of v.errors) console.log(`✗ ${e}`); console.log("\n✗ the app will NOT accept this file"); process.exit(1); }
  for (const w of v.warnings) console.log(`⚠ ${w}`);
  return normalize(v.value!);
}

function summary(tl: Timeline) {
  const seqs = seqOpt ? tl.sequences.filter((s) => s.id === seqOpt) : tl.sequences;
  console.log(`${tl.project.name} · active sequence ${tl.activeSequence} · nextId ${tl.nextId} (next new clip: c${tl.nextId})`);
  for (const s of seqs) {
    console.log(`\n=== ${s.id} "${s.name}" ${s.width}×${s.height} @ ${s.fps} fps · length ${fmtTime(sequenceDuration(s))}${s.id === tl.activeSequence ? " (active)" : ""}`);
    for (const t of [...s.tracks].reverse()) {
      const flags = [t.muted && "muted", t.hidden && "hidden", t.locked && "locked"].filter(Boolean).join(", ");
      console.log(`\n${t.id} ${t.kind.toUpperCase()} "${t.name}"${flags ? ` [${flags}]` : ""}`);
      for (const c of t.clips) {
        const len = clipLength(c);
        const what = isText(c) ? `"${c.text.replace(/\n/g, " / ")}"` : `${mediaName(tl.media.find((m) => m.id === c.media)!)} [in ${c.in} → out ${c.out}]`;
        const extra = [!isText(c) && c.volume !== 1 && `vol ${c.volume}`, c.fadeIn && `fadeIn ${c.fadeIn}`, c.fadeOut && `fadeOut ${c.fadeOut}`, c.label && `label "${c.label}"`].filter(Boolean).join(", ");
        console.log(`  ${c.id.padEnd(5)} ${fmtTime(c.start)}–${fmtTime(c.start + len)} (${len.toFixed(3)}s)  ${what}${extra ? `  · ${extra}` : ""}`);
      }
    }
  }
  console.log(`\nmedia: ${tl.media.map((m) => `${m.id}=${mediaName(m)}${m.duration ? ` (${m.duration}s)` : ""}`).join(", ") || "none"}`);
}

function printHistory(list: any[]) {
  for (const e of list) {
    const who = e.author === "you" ? "Omnia " : e.author === "claude" ? "Claude" : "app   ";
    const tag = e.kind === "edit" ? "" : ` [${e.kind}${e.ref !== undefined ? ` of ${e.ref}` : ""}]`;
    console.log(`rev ${String(e.rev).padStart(4)}  ${e.at.slice(11, 19)}  ${who}${tag}${e.undone ? " (undone)" : ""}  ${e.changes.map((c: any) => c.text).join("; ") || e.note || ""}`);
  }
}

async function main() {
  switch (cmd) {
    case "summary": summary(load()); console.log("\n✓ valid"); break;
    case "check": load(); console.log("✓ valid"); break;
    case "history": {
      const n = Number(rest[0]) || 20;
      const j = await api("GET", `/api/history?limit=${n}`);
      if (j) printHistory(j);
      else {
        const log = path.join(project, ".history", "log.jsonl");
        const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").slice(-n) : [];
        printHistory(lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
      }
      break;
    }
    case "undo": case "redo": {
      const j = needApp(await api("POST", `/api/${cmd}`, { author: as }));
      console.log(`✓ ${cmd} → rev ${j.rev}: ${j.entry.changes.map((c: any) => c.text).join("; ")}`);
      break;
    }
    case "revert": case "restore": {
      const rev = Number(rest[0]);
      if (!Number.isInteger(rev)) { console.error(`usage: bge ${cmd} <rev>`); process.exit(2); }
      const j = needApp(await api("POST", `/api/${cmd}`, { rev, author: as }));
      console.log(`✓ ${cmd} rev ${rev} → rev ${j.rev}: ${j.entry.changes.map((c: any) => c.text).join("; ") || "no visible change"}`);
      break;
    }
    case "status": {
      needApp(await api("POST", "/api/presence", { author: "claude", message: rest.join(" "), ttl: 180000 }));
      console.log(rest.length ? `✓ showing "Claude is ${rest.join(" ")}…"` : "✓ cleared");
      break;
    }
    case "import": {
      const j = needApp(await api("POST", "/api/import", { paths: rest.map((p) => path.resolve(p)), author: "claude" }));
      console.log(`✓ added ${j.added.join(", ") || "nothing new"}${j.skipped ? ` (${j.skipped} already imported)` : ""}`);
      for (const f of j.failed) console.log(`✗ ${f.path}: ${f.error}`);
      break;
    }
    default:
      console.error(`unknown command "${cmd}". Try: summary, check, history, undo, redo, revert <rev>, restore <rev>, status "<msg>", import <paths>`);
      process.exit(2);
  }
}
main();
