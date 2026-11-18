# BLKGRLCO Edit

A Mac video editor where the whole edit is one file, `timeline.json`, and Omnia and Claude Code
edit it at the same time. Roadmap and architecture: [`PLAN.md`](PLAN.md). How Claude edits
(schema + commands): [`CLAUDE.md`](CLAUDE.md).

**Status: Phase 1 (Foundation) built.** Phase 2 (fast 4K import engine) is next.

## Start it

1. Once: `brew install node ffmpeg`
2. Double-click **`Start BLKGRLCO Edit.command`**. The first run installs and builds (a couple of
   minutes), then the app opens. If macOS blocks it: right-click → Open.
3. **⌘I** imports files, **⇧⌘I** a whole folder, or drag them in from Finder. Footage is used
   where it is (including the T7) and never copied.
4. To edit together, open Claude Code in this repo on the same Mac and ask in plain words:
   "trim clip 3", "add a title at 0:05", "undo that".

**File → Open Project Folder…** switches projects (e.g. a folder next to a video's footage on
the T7); each folder gets its own `timeline.json`, history and exports. It reopens the last one.

## What Phase 1 gives you

| | |
|---|---|
| Live, two-way | Your edits write `timeline.json`; Claude's edits to it show up instantly, glowing, with "Claude is editing…" |
| Merging | Your drag and Claude's edit at the same moment both land, as long as they touch different things. If both change the same value, the later one is refused with a message; nothing is silently lost |
| Undo/redo for both | **⌘Z / ⇧⌘Z** undo and redo *your* changes; Claude undoes its own ("undo that") |
| History panel | Every change by you, Claude or the app. Filter by who. Hover an entry → **Revert** (undo just that one) or **Restore to here** (rewind everything) — both undoable |
| Autosave | Every change is on disk the moment you make it. There's no Save button |
| Crash recovery | If the app or the computer dies, nothing is lost. A damaged `timeline.json` is restored from history on start (the damaged copy is kept). The app restarts its server by itself |
| Sequences | Several cuts in one project (tabs above the timeline); **+ Duplicate** makes e.g. the Shorts version |
| Track lock | **L** on a track header protects it from edits (yours and Claude's) |

Keys: Space play/pause · S split · ⌫ delete · ← → frame (⇧: 1 s) · Home/End · +/− zoom · ⌘E export.

## Checking it on your Mac

Double-click **`run-mac-tests.command`**. It runs every test plus a Mac-app check on generated
clips (it never touches your projects) and copies a report to your clipboard to paste to Claude.

## Files in a project folder

| | |
|---|---|
| `timeline.json` | The edit — the only file anyone edits |
| `.history/` | Every change (who, what, and how to undo it) + snapshots. Don't edit |
| `activity.jsonl` | A readable one-line-per-change log |
| `media/` | Optional drop folder: files put here are imported automatically |
| `fonts/` | Extra fonts (brand fonts from `brand-bible/` are already available) |
| `exports/` | Rendered MP4s |
| `.cache/` | Thumbnails, waveforms, previews (safe to delete) |

The default `project/` folder is gitignored (this repo is public).

## Development

`npm run dev` (hot reload, browser at :5310) · `npm run app` (build + open the Mac app) ·
`npm test` · `npm run test:electron` · `npm run typecheck` · `npx tsx scripts/bge.ts summary`.
