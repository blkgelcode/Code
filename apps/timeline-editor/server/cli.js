// Command-line helpers, mainly for Claude Code. They work with or without the
// server running; when it is running, it sees the file change and updates the UI.
//
//   npm run import [-- paths…]  add files/folders (default: media/) to timeline.json
//   npm run validate          check timeline.json and list problems
//   npm run export [out.mp4]  render timeline.json to an MP4
import fs from "node:fs";
import { ensureProject, readTimelineFile, serialize, TIMELINE_FILE, MEDIA_DIR } from "./store.js";
import { importPaths } from "./media.js";
import { exportTimeline } from "./export.js";
import { totalDuration, migrate, seqOf } from "../src/lib/model.js";

const [cmd, arg, ...more] = process.argv.slice(2);
ensureProject();
const r = readTimelineFile();

function requireValid() {
  if (!r.timeline) {
    console.error("timeline.json has errors:\n - " + r.errors.join("\n - "));
    process.exit(1);
  }
}

if (cmd === "validate") {
  if (r.errors.length) {
    console.error("INVALID\n - " + r.errors.join("\n - "));
    process.exit(1);
  }
  const seq = seqOf(r.timeline);
  console.log(`OK: ${seq.tracks.length} tracks, ${seq.tracks.reduce((n, t) => n + t.clips.length, 0)} clips, ${totalDuration(r.timeline)}s${r.migrated ? " (v1 file: the app upgrades it to v2 on start)" : ""}`);
  for (const w of r.warnings) console.log(`warning: ${w}`);
} else if (cmd === "import") {
  requireValid();
  // keep the file exactly as written apart from the new media entries
  const paths = arg ? [arg, ...more] : [MEDIA_DIR];
  const { timeline, added, failed, skipped } = await importPaths(r.timeline, paths);
  if (added.length) {
    const raw = migrate(r.raw);
    raw.media = [...(raw.media || []), ...added];
    seqOf(raw).settings = seqOf(timeline).settings;
    fs.writeFileSync(TIMELINE_FILE, serialize(raw));
  }
  for (const m of added) console.log(`added ${m.id}: ${m.file} (${m.kind}${m.duration ? `, ${m.duration}s` : ""}${m.width ? `, ${m.width}×${m.height}` : ""}${m.fps ? ` @ ${m.fps}fps` : ""}${m.codec ? `, ${m.codec} ${m.bitDepth}-bit` : ""})`);
  for (const x of failed) console.log(`failed ${x.file}: ${x.error}`);
  if (skipped) console.log(`${skipped} already imported`);
  if (!added.length && !failed.length && !skipped) console.log("nothing to import");
  if (added.length) console.log("Thumbnails, waveforms and proxies are made by the app's background queue (npm run dev).");
} else if (cmd === "export") {
  requireValid();
  let last = -1;
  const out = await exportTimeline(r.timeline, {
    outFile: arg,
    onProgress: (p) => {
      const pct = Math.floor(p * 10) * 10;
      if (pct !== last) process.stdout.write(`${pct}% `);
      last = pct;
    },
  });
  console.log(`\nexported ${out}`);
} else {
  console.log("usage: node server/cli.js import | validate | export [out.mp4]");
  process.exit(cmd ? 1 : 0);
}
