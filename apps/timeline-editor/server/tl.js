// `tl`: edit the timeline from the command line with the same operations the UI
// uses (linked clips move/trim/split/delete together, overlaps are refused).
//
//   npm run tl -- show                      tracks and clips, with ids and times
//   npm run tl -- trim c3 --start +3        cut the first 3 s (also: --end -2, --start 0:05)
//   npm run tl -- move c4 0:20 [--track v2]
//   npm run tl -- split c2 0:07
//   npm run tl -- delete c6 [--ripple]
//   npm run tl -- add m3 [--at 0:10] [--track v1]
//   npm run tl -- title "good morning" --at 0:05 [--duration 3]
//   npm run tl -- set c2 volume=0.4 fadeOut=1 text="hi" color.look=none
//   npm run tl -- unlink c2                 (and --unlinked on move/trim/split/delete)
//   npm run tl -- lut m1 dlogm|none         D-Log M conversion for a media file
//   npm run tl -- channel @blkgrlco|@blkgrlcotakesoff|podcast|none
//   npm run tl -- look channel|none|<path.cube>
//   npm run tl -- undo [--seq 12] | redo | history
//   npm run tl -- version "before rough cut" | versions | restore <id>
//
// With the app running, edits are written to timeline.json (the app records them as
// Claude's) and undo/redo/versions go through the app, so there's one history.
// Without it, the same History files are updated directly.
import fs from "node:fs";
import {
  seqOf, findClip, clipEnd, moveClip, trimClip, splitClip, deleteClip, addMediaClip, addTextClip,
  updateClip, updateMedia, updateProject, unlinkClip, isTextClip, mediaById, totalDuration, round, CHANNELS,
} from "../src/lib/model.js";
import { ensureProject, readTimelineFile, serialize, TIMELINE_FILE, LOCK_FILE, PROJECT_DIR, TimelineStore } from "./store.js";

const argv = process.argv.slice(2);
const cmd = argv.shift();
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = true;
  } else pos.push(a);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** "0:05" -> 5, "1:02.5" -> 62.5, "5s" -> 5, "12.3" -> 12.3 */
export function parseTime(s) {
  const str = String(s).trim().replace(/s$/, "");
  const parts = str.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) fail(`Can't read the time "${s}". Use seconds (12.5) or m:ss (0:05).`);
  return round(parts.reduce((acc, n) => acc * 60 + n, 0));
}
/** "+3" / "-2" relative to `base`, otherwise absolute. */
const timeArg = (s, base) => (/^[+-]/.test(String(s)) ? round(base + Number(String(s).replace(/s$/, ""))) : parseTime(s));

// ---- talk to the running app, if there is one --------------------------------------------

async function server() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    process.kill(lock.pid, 0);
    const r = await fetch(`http://127.0.0.1:${lock.port}/api/ping`, { signal: AbortSignal.timeout(1500) }).then((x) => x.json());
    return r.projectDir === PROJECT_DIR ? `http://127.0.0.1:${lock.port}` : null;
  } catch {
    return null;
  }
}

async function call(base, path, body) {
  const r = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
  if (r.ok === false) fail(r.error);
  return r;
}

ensureProject();
const base = await server();
const current = () => {
  const r = readTimelineFile();
  if (!r.timeline) fail(`timeline.json has errors:\n - ${r.errors.join("\n - ")}`);
  return r.timeline;
};

function save(next, what) {
  if (!next) fail(`Couldn't ${what}: it would overlap another clip, or the clip/time isn't valid. Run "npm run tl -- show".`);
  if (base) {
    // the app sees the change on disk and records it as Claude's
    const tmp = `${TIMELINE_FILE}.tl.tmp`;
    fs.writeFileSync(tmp, serialize(next));
    fs.renameSync(tmp, TIMELINE_FILE);
  } else {
    const r = new TimelineStore().write(next, "claude");
    if (!r.ok) fail((r.errors || [r.error]).join("\n"));
  }
  console.log(`done: ${what}`);
}

const clipArg = (tl, id) => {
  const f = id && findClip(tl, id);
  if (!f) fail(`No clip "${id}". Run "npm run tl -- show" to see the ids.`);
  return f;
};
const linked = { linked: !flags.unlinked };

// ---- commands ----------------------------------------------------------------------------

function show(tl) {
  const seq = seqOf(tl);
  const s = seq.settings;
  console.log(`${tl.project.name} · channel ${tl.project.channel || "none"} · look ${tl.project.look} · ${s.width}×${s.height} @ ${s.fps}fps · ${totalDuration(tl)}s`);
  for (const t of seq.tracks) {
    const flagsTxt = [t.hidden && "hidden", t.muted && "muted", t.volume !== undefined && t.volume !== 1 && `vol ${t.volume}`].filter(Boolean).join(", ");
    console.log(`\n${t.id} (${t.kind}) ${t.name}${flagsTxt ? ` [${flagsTxt}]` : ""}`);
    for (const c of t.clips) {
      const range = `${round(c.start)}–${round(clipEnd(c))}s`;
      if (isTextClip(c)) console.log(`  ${c.id}  ${range}  "${c.text}"`);
      else {
        const m = mediaById(tl, c.media);
        const extra = [c.link && `link ${c.link}`, c.volume !== undefined && c.volume !== 1 && `vol ${c.volume}`, c.fadeIn && `fade in ${c.fadeIn}`, c.fadeOut && `fade out ${c.fadeOut}`,
          t.kind === "video" && m?.logProfile === "dlogm" && (c.color?.input ?? "auto") !== "none" && "D-Log M→709"].filter(Boolean).join(", ");
        console.log(`  ${c.id}  ${range}  ${c.media} ${m?.file.split("/").pop()} [source ${c.in}–${c.out}]${extra ? `  (${extra})` : ""}`);
      }
    }
  }
  if (tl.media.length) {
    console.log("\nmedia:");
    for (const m of tl.media) console.log(`  ${m.id}  ${m.file}  ${m.kind}${m.duration ? ` ${m.duration}s` : ""}${m.logProfile === "dlogm" ? " D-Log M" : ""}`);
  }
}

function setValue(v) {
  if (v === "true" || v === "false") return v === "true";
  if (v === "null") return null;
  if (v !== "" && Number.isFinite(Number(v))) return Number(v);
  return v.replace(/^"|"$/g, "");
}

async function main() {
  if (!cmd || cmd === "help") {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 22).map((l) => l.slice(3)).join("\n"));
    return;
  }

  // history and versions go through the app when it's running, so there's one history
  if (["undo", "redo", "history", "version", "versions", "restore"].includes(cmd)) {
    if (base) {
      if (cmd === "undo") await call(base, "/api/undo", { author: "claude", seq: flags.seq ? Number(flags.seq) : undefined });
      else if (cmd === "redo") await call(base, "/api/redo", { author: "claude" });
      else if (cmd === "history") return printHistory(await call(base, "/api/history"));
      else if (cmd === "version") await call(base, "/api/versions", { name: pos[0] || "Version", author: "claude" });
      else if (cmd === "versions") return printVersions(await call(base, "/api/versions"));
      else if (cmd === "restore") await call(base, "/api/versions/restore", { id: pos[0], author: "claude" });
    } else {
      const store = new TimelineStore();
      if (cmd === "undo") flags.seq ? store.undoEntry(Number(flags.seq), "claude") : store.undo("claude");
      else if (cmd === "redo") store.redo("claude");
      else if (cmd === "history") return printHistory({ ...store.history.status(), entries: store.history.entries.slice(-50).map((e) => store.history.summary(e)) });
      else if (cmd === "version") store.saveVersion(pos[0] || "Version", "claude");
      else if (cmd === "versions") return printVersions(store.history.listVersions());
      else if (cmd === "restore") store.restoreVersion(pos[0], "claude");
    }
    console.log(`done: ${cmd}${pos[0] ? ` ${pos[0]}` : ""}${flags.seq ? ` #${flags.seq}` : ""}`);
    return;
  }

  const tl = current();
  switch (cmd) {
    case "show":
      return flags.json ? console.log(serialize(tl)) : show(tl);
    case "trim": {
      const { clip } = clipArg(tl, pos[0]);
      let next = tl;
      if (flags.start !== undefined) next = trimClip(next, clip.id, "start", timeArg(flags.start, clip.start), linked);
      if (flags.end !== undefined) next = next && trimClip(next, clip.id, "end", timeArg(flags.end, clipEnd(findClip(next, clip.id).clip)), linked);
      if (flags.in !== undefined || flags.out !== undefined) {
        const c = findClip(next, clip.id).clip;
        if (flags.in !== undefined) next = trimClip(next, clip.id, "start", round(c.start + (parseTime(flags.in) - c.in)), linked);
        const c2 = findClip(next, clip.id).clip;
        if (flags.out !== undefined) next = trimClip(next, clip.id, "end", round(c2.start + (parseTime(flags.out) - c2.in)), linked);
      }
      if (next === tl) fail("Say what to trim: --start, --end, --in or --out.");
      return save(next, `trim ${clip.id}`);
    }
    case "move": {
      const { clip } = clipArg(tl, pos[0]);
      return save(moveClip(tl, clip.id, timeArg(pos[1], clip.start), flags.track, linked), `move ${clip.id} to ${timeArg(pos[1], clip.start)}s`);
    }
    case "split": {
      const { clip } = clipArg(tl, pos[0]);
      return save(splitClip(tl, clip.id, parseTime(pos[1]), linked), `split ${clip.id} at ${parseTime(pos[1])}s`);
    }
    case "delete":
      clipArg(tl, pos[0]);
      return save(deleteClip(tl, pos[0], { ...linked, ripple: Boolean(flags.ripple) }), `delete ${pos[0]}${flags.ripple ? " (ripple)" : ""}`);
    case "unlink":
      clipArg(tl, pos[0]);
      return save(unlinkClip(tl, pos[0]), `unlink ${pos[0]}`);
    case "add": {
      if (!mediaById(tl, pos[0])) fail(`No media "${pos[0]}". Import it first: npm run import -- <path>`);
      const r = addMediaClip(tl, pos[0], flags.track, flags.at !== undefined ? parseTime(flags.at) : null);
      return save(r?.timeline, `add ${pos[0]} as ${r?.clipIds.join(" + ")}`);
    }
    case "title": {
      const r = addTextClip(tl, flags.at !== undefined ? parseTime(flags.at) : 0, pos[0] || "Title", flags.duration ? parseTime(flags.duration) : 3);
      return save(r.timeline, `title ${r.clipId} "${pos[0]}"`);
    }
    case "set": {
      const { clip } = clipArg(tl, pos[0]);
      const patch = {};
      for (const kv of pos.slice(1)) {
        const i = kv.indexOf("=");
        if (i < 0) fail(`Use key=value, not "${kv}".`);
        const [k, v] = [kv.slice(0, i), setValue(kv.slice(i + 1))];
        if (k.includes(".")) {
          const [o, sub] = k.split(".");
          patch[o] = { ...(patch[o] || {}), [sub]: v };
        } else patch[k] = v;
      }
      return save(updateClip(tl, clip.id, patch), `set ${clip.id} ${pos.slice(1).join(" ")}`);
    }
    case "lut": {
      if (!mediaById(tl, pos[0]) || !["dlogm", "none"].includes(pos[1])) fail('Use: lut <media id> dlogm|none');
      return save(updateMedia(tl, pos[0], { logProfile: pos[1] }), `${pos[0]} color input ${pos[1]}`);
    }
    case "channel": {
      const ch = pos[0] === "none" ? null : pos[0];
      if (ch !== null && !CHANNELS.includes(ch)) fail(`Channel must be one of ${CHANNELS.join(", ")} or none.`);
      return save(updateProject(tl, { channel: ch }), `channel ${pos[0]}`);
    }
    case "look":
      if (!pos[0]) fail("Use: look channel|none|<path to .cube>");
      return save(updateProject(tl, { look: pos[0] }), `look ${pos[0]}`);
    default:
      fail(`Unknown command "${cmd}". Run "npm run tl -- help".`);
  }
}

function printHistory(h) {
  const applied = new Set(h.applied);
  for (const e of h.entries) console.log(`${applied.has(e.seq) ? " " : "↶"} #${e.seq} ${e.author.padEnd(6)} ${e.text}`);
  console.log(h.canUndo ? `\nnext undo: #${h.canUndo.seq}` : "\nnothing to undo");
}

function printVersions(list) {
  for (const v of list.slice(0, 40)) console.log(`${v.id}  ${v.ts}  ${v.name}`);
}

await main();
