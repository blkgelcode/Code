#!/usr/bin/env node
// PreToolUse hook: before the Artifact tool publishes dashboard/omnia-os.html, run check.js.
// A failing check denies the publish and hands the report back to Claude.
const { spawnSync } = require("child_process");
const path = require("path");

let input = "";
process.stdin.on("data", d => (input += d));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse(input || "{}"); } catch {}
  const ti = j.tool_input || {};
  const publishing = (!ti.action || ti.action === "publish") && !ti.asset && /omnia-os\.html$/.test(String(ti.file_path || ""));
  if (!publishing) process.exit(0);           // not our file, or not a publish: let it through

  const r = spawnSync(process.execPath, [path.join(__dirname, "check.js")], { encoding: "utf8", timeout: 170000 });
  const report = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "check.js passed" }, suppressOutput: true }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "dashboard/check.js found problems. Fix them and publish again.\n\n" + report.trim() },
    systemMessage: "Publish blocked: the dashboard checker found problems.",
  }));
  process.exit(0);
});
