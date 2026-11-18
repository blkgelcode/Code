// Command-line helpers, mainly for Claude Code. They work with or without the
// server running; when it is running, it sees the file change and updates the UI.
//
//   npm run import            add new files from media/ to timeline.json
//   npm run validate          check timeline.json and list problems
//   npm run export [out.mp4]  render timeline.json to an MP4
import fs from "node:fs";
import { ensureProject, readTimelineFile, serialize, TIMELINE_FILE } from "./store.js";
import { importNew } from "./media.js";
import { exportTimeline } from "./export.js";
import { totalDuration } from "../src/lib/model.js";

const [cmd, arg] = process.argv.slice(2);
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
  console.log(`OK: ${r.timeline.tracks.length} tracks, ${r.timeline.tracks.reduce((n, t) => n + t.clips.length, 0)} clips, ${totalDuration(r.timeline)}s`);
  for (const w of r.warnings) console.log(`warning: ${w}`);
} else if (cmd === "import") {
  requireValid();
  // keep the file exactly as written apart from the new media entries
  const { added, failed } = await importNew(r.timeline);
  if (added.length) {
    const raw = r.raw;
    raw.media = [...(raw.media || []), ...added];
    fs.writeFileSync(TIMELINE_FILE, serialize(raw));
  }
  for (const m of added) console.log(`added ${m.id}: ${m.file} (${m.kind}${m.duration ? `, ${m.duration}s` : ""}${m.width ? `, ${m.width}×${m.height}` : ""})`);
  for (const x of failed) console.log(`failed ${x.file}: ${x.error}`);
  if (!added.length && !failed.length) console.log("nothing new in media/");
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
