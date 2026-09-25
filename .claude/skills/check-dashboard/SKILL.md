---
name: check-dashboard
description: Double-check the Omnia OS dashboard (dashboard/omnia-os.html) for errors before publishing. Run it after any edit to the dashboard, or when Omnia asks whether the code has errors.
---

# /check-dashboard

This check also runs automatically: a project PreToolUse hook
(`.claude/settings.json` → `dashboard/check-hook.js`) runs it before the
Artifact tool publishes `dashboard/omnia-os.html` and blocks the publish if
it fails. Run the command by hand when asked or after edits.

Run the checker and act on what it says.

1. Run `node dashboard/check.js` from the repo root. If it reports that
   playwright is missing, run `npm i -s playwright` in the scratchpad or home
   directory once and rerun (a Chromium at `/opt/pw-browsers/chromium` is
   used when present; set `CHROME_PATH` otherwise).
2. Read every line. `✓` passed, `⚠` skipped, `✗` failed.
3. For each `✗`, fix the cause in `dashboard/omnia-os.html`, then rerun until
   the last line reads `Clean. Safe to publish.` Don't weaken a check to make
   it pass.
4. Report back in plain words: what was checked, what failed, what was
   fixed. If the file changed, republish the artifact
   (https://claude.ai/artifact/PJMgHgWkjLs5XJQBZZTTgV) by publishing
   `dashboard/omnia-os.html` again, commit, and push.

What it checks: JavaScript syntax; the number of page tools sent to Claude
(limit 16); that routine prompts only name tools that exist; the title and
external resources; that every CSS token is defined and dark mode has both
blocks; that only real capabilities are requested; that every button has a
handler; and, in a headless browser at phone and desktop widths, that every
tab renders without sideways scroll and that a mocked "ask Claude" round
trip runs the page tools.
