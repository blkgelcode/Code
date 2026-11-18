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
// Editing (same engine as her tools; times are 1:05, 65.5, 00:01:05:15, 90f):
//   bge insert <media> [--in t] [--out t] --at t      three-point insert: pushes later clips on sync-locked tracks
//   bge overwrite <media> [--in t] [--out t] --at t   overwrite on the targeted tracks
//   bge append <media> [--in t] [--out t]             add at the end
//   bge replace <clip> <media> [--in t]               swap a clip's source, keep its place and length
//   bge lift <a> <b> | extract <a> <b>                remove a range (extract closes the gap)
//   bge ripple-delete <clip…>                         delete clips (and linked sound) and close up
//   bge close-gap <track> <t> | close-gaps <track>    close the gap at t / every gap on a track
//   bge blade <t> [track…]                            cut every (or the given) track at t
//   bge ripple-trim <clip> start|end <±seconds>       trim and shift what follows
//   bge roll <leftClip> <±s> | slip <clip> <±s> | slide <clip> <±s> | nudge <clip…> <±frames>
//   bge link <clip…> | unlink <clip…>                 (add --one-side to trim/roll/slip only that clip: J/L cuts)
//   bge nest <clip…> [--name "Nested"]                move clips into a new nested sequence
//   bge version                                       duplicate the active sequence as "<name> v2"
//   bge marker <t> "name" [--type comment|chapter|todo|claude] [--note "…"] [--clip c3] [--color olive]
//   bge marker-done <k…> | marker-rm <k…>
//   bge markers                                       every marker with timecode
//   bge notes                                         open notes Omnia left for Claude (type "claude")
//   bge chapters                                      YouTube chapters from chapter markers
//
// Options: --project <dir> (default ../project), --port <n> (default 5310).
// Talks to the running app when it's up; summary/check/history also work when it isn't.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, migrate, normalize, clipLength, isText, isNested, sequenceDuration, mediaName, type Timeline } from "../shared/model";
import { fmtTime } from "../shared/ops";
import * as X from "../shared/editing";
import { parseTimecode, toTimecode } from "../shared/timecode";

process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); });
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const project = path.resolve(opt("project") || process.env.BLKEDIT_PROJECT || path.join(here, "..", "project"));
const port = Number(opt("port") || process.env.PORT || 5310);
const as = opt("as") === "you" ? "you" : "claude";
const seqOpt = opt("seq");
const oIn = opt("in"), oOut = opt("out"), oAt = opt("at"), oType = opt("type"), oNote = opt("note"), oClip = opt("clip"), oColor = opt("color"), oName = opt("name");
const oneSide = args.includes("--one-side") ? (args.splice(args.indexOf("--one-side"), 1), true) : false;
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
        const what = isText(c) ? `"${c.text.replace(/\n/g, " / ")}"` : isNested(c) ? `[nested ${c.seq}: ${tl.sequences.find((x) => x.id === c.seq)?.name ?? "?"}] [in ${c.in} → out ${c.out}]` : `${mediaName(tl.media.find((m) => m.id === c.media)!)} [in ${c.in} → out ${c.out}]`;
        const extra = [!isText(c) && c.volume !== 1 && `vol ${c.volume}`, c.fadeIn && `fadeIn ${c.fadeIn}`, c.fadeOut && `fadeOut ${c.fadeOut}`, c.label && `label "${c.label}"`, !isText(c) && c.link && `linked ${c.link}`].filter(Boolean).join(", ");
        console.log(`  ${c.id.padEnd(5)} ${fmtTime(c.start)}–${fmtTime(c.start + len)} (${len.toFixed(3)}s)  ${what}${extra ? `  · ${extra}` : ""}`);
      }
    }
  }
  console.log(`\nmedia: ${tl.media.map((m) => `${m.id}=${mediaName(m)}${m.duration ? ` (${m.duration}s)` : ""}`).join(", ") || "none"}`);
}

// ------------------------------------------------------------------ editing commands
/** Run an edit on the file the way the app would see Claude do it: read fresh, change, validate, write atomically. */
async function edit(fn: (tl: Timeline, fps: number) => X.Result) {
  const tl = load();
  const active = tl.activeSequence;
  if (seqOpt) { if (!tl.sequences.some((x) => x.id === seqOpt)) { console.error(`✗ no sequence ${seqOpt}`); process.exit(2); } tl.activeSequence = seqOpt; }
  const fps = X.seqOf(tl).fps;
  const r = fn(tl, fps);
  if (!r.ok) { console.error(`✗ ${r.message}`); process.exit(1); }
  const next = r.timeline;
  // a command-line edit never changes which sequence she's looking at
  if (next.sequences.some((x) => x.id === active)) next.activeSequence = active;
  const v = validate(JSON.parse(JSON.stringify(next)));
  if (!v.ok) { for (const e of v.errors) console.error(`✗ ${e}`); console.error("✗ not written: the result wouldn't be valid"); process.exit(1); }
  const tmp = `${file}.bge-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(normalize(v.value!), null, 2) + "\n");
  fs.renameSync(tmp, file);
  console.log(`✓ ${cmd}${r.ids?.length ? `: ${r.ids.join(", ")}` : ""}${r.message ? ` — ${r.message}` : ""}`);
}
const time = (s: string | undefined, fps: number, what: string, from = 0) => {
  const t = s === undefined ? null : parseTimecode(s, fps, from);
  if (t === null) { console.error(`✗ ${what}: give a time like 1:05, 65.5, 00:01:05:15 or 90f`); process.exit(2); }
  return t;
};
const num = (s: string | undefined, what: string) => { const n = Number(s); if (!Number.isFinite(n)) { console.error(`✗ ${what} must be a number`); process.exit(2); } return n; };
function source(tl: Timeline, fps: number, id: string | undefined) {
  if (!id) { console.error("✗ which media? (an id like m3, or a file name)"); process.exit(2); }
  const m = tl.media.find((x) => x.id === id || x.name === id);
  const sq = !m ? tl.sequences.find((x) => x.id === id || x.name === id) : undefined;
  if (!m && !sq) { console.error(`✗ no media or sequence "${id}" (bge summary lists them; bge import adds files)`); process.exit(2); }
  const total = m ? (m.type === "image" ? 3 : m.duration ?? 3) : sequenceDuration(sq!);
  const a = oIn !== undefined ? time(oIn, fps, "--in") : 0;
  const b = oOut !== undefined ? time(oOut, fps, "--out") : total;
  return m ? { media: m.id, in: a, out: b } : { seq: sq!.id, in: a, out: b };
}
const EDITS: Record<string, () => Promise<void>> = {
  insert: () => edit((tl, fps) => X.insert(tl, source(tl, fps, rest[0]), time(oAt, fps, "--at"))),
  overwrite: () => edit((tl, fps) => X.overwrite(tl, source(tl, fps, rest[0]), time(oAt, fps, "--at"))),
  append: () => edit((tl, fps) => X.append(tl, source(tl, fps, rest[0]))),
  replace: () => edit((tl, fps) => X.replace(tl, rest[0], source(tl, fps, rest[1]))),
  lift: () => edit((tl, fps) => X.lift(tl, time(rest[0], fps, "start"), time(rest[1], fps, "end"))),
  extract: () => edit((tl, fps) => X.extract(tl, time(rest[0], fps, "start"), time(rest[1], fps, "end"))),
  "ripple-delete": () => edit((tl) => X.rippleDelete(tl, rest, !oneSide)),
  "close-gap": () => edit((tl, fps) => X.closeGap(tl, rest[0], time(rest[1], fps, "time"))),
  "close-gaps": () => edit((tl) => X.closeAllGaps(tl, rest[0])),
  blade: () => edit((tl, fps) => X.blade(tl, time(rest[0], fps, "time"), rest.length > 1 ? rest.slice(1) : undefined)),
  "ripple-trim": () => edit((tl) => X.rippleTrim(tl, rest[0], rest[1] === "start" ? "start" : "end", num(rest[2], "seconds"), !oneSide)),
  roll: () => edit((tl) => X.roll(tl, rest[0], num(rest[1], "seconds"), !oneSide)),
  slip: () => edit((tl) => X.slip(tl, rest[0], num(rest[1], "seconds"), !oneSide)),
  slide: () => edit((tl) => X.slide(tl, rest[0], num(rest[1], "seconds"), !oneSide)),
  nudge: () => edit((tl) => X.nudge(tl, rest.slice(0, -1), num(rest[rest.length - 1], "frames"), !oneSide)),
  link: () => edit((tl) => X.link(tl, rest)),
  unlink: () => edit((tl) => X.unlink(tl, rest)),
  nest: () => edit((tl) => X.nest(tl, rest, oName)),
  version: () => edit((tl) => X.duplicateAsVersion(tl, oName)),
  marker: () => edit((tl, fps) => {
    const s = X.seqOf(tl);
    let t = time(rest[0], fps, "time");
    if (oClip) { const f = X.locate(s, oClip); if (!f || isText(f.clip)) { console.error(`✗ no picture/sound clip ${oClip} in ${s.id}`); process.exit(2); } t = (f.clip as any).in + (t - f.clip.start); }
    return X.addMarker(tl, { t, name: rest[1] ?? "", type: (oType as any) ?? "comment", note: oNote, color: oColor as any }, oClip);
  }),
  "marker-done": () => edit((tl) => rest.reduce<X.Result>((r, id) => (r.ok ? X.updateMarker(r.timeline, id, { done: true }) : r), { ok: true, timeline: tl })),
  "marker-rm": () => edit((tl) => rest.reduce<X.Result>((r, id) => (r.ok ? X.deleteMarker(r.timeline, id) : r), { ok: true, timeline: tl })),
};

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
    case "markers": {
      const tl = load();
      for (const sq of tl.sequences.filter((x) => !seqOpt || x.id === seqOpt)) {
        const ms = X.allMarkers(sq);
        console.log(`\n=== ${sq.id} "${sq.name}" (${ms.length} markers)`);
        for (const k of ms) console.log(`  ${k.id.padEnd(5)} ${toTimecode(k.at, sq.fps)}${k.duration ? ` +${k.duration}s` : ""}  ${k.type.padEnd(7)} ${k.color.padEnd(6)} ${k.done ? "✓ " : ""}${k.name || "(no name)"}${k.note ? ` — ${k.note}` : ""}${k.clipId ? `  [on ${k.clipId}]` : ""}`);
      }
      break;
    }
    case "notes": {
      const notes = X.claudeNotes(load());
      if (!notes.length) console.log("No open notes for Claude.");
      for (const n of notes) console.log(`${n.id}  ${n.seq} ${n.at}${n.clipId ? ` [${n.clipId}]` : ""}  ${n.name || ""}${n.note ? ` — ${n.note}` : ""}`);
      if (notes.length) console.log(`\nWhen one's handled: bge marker-done ${notes.map((n) => n.id).join(" ")}`);
      break;
    }
    case "chapters": {
      const tl = load();
      const ch = X.youtubeChapters(X.seqOf({ ...tl, activeSequence: seqOpt || tl.activeSequence }));
      if (ch.text) console.log(ch.text);
      for (const w of ch.warnings) console.log(`⚠ ${w}`);
      break;
    }
    default:
      if (EDITS[cmd]) { await EDITS[cmd](); break; }
      console.error(`unknown command "${cmd}". Try: summary, check, history, undo, redo, revert <rev>, restore <rev>, status "<msg>", import <paths>, markers, notes, chapters, ${Object.keys(EDITS).join(", ")}`);
      process.exit(2);
  }
}
main();
