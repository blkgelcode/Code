# BLKGRLCO Edit

A Mac video editor where the whole edit is one file, `timeline.json`, and Omnia and Claude Code
edit it at the same time. Roadmap and architecture: [`PLAN.md`](PLAN.md). How Claude edits
(schema + commands): [`CLAUDE.md`](CLAUDE.md).

**Status: Phases 1–4 built** (Foundation · Import & media engine · Playback engine · Pro editing). Phase 5 is next.

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

## What Phase 2 gives you (big 4K files)

| | |
|---|---|
| Import by path | ⌘I files, ⇧⌘I a folder (with subfolders), or drag from Finder. Clips appear in the bin in about a second with resolution, fps, codec, 10-bit/HDR/VFR badges. Nothing is copied or uploaded |
| Background previews | Each video gets a light 960×540 preview (hardware-encoded), plus a thumbnail, a filmstrip and a waveform. Two at a time, low priority, so the Mac stays responsive. A progress bar on every clip |
| Edit right away | A clip can go on the timeline as soon as its preview is ready |
| Never twice | Previews are cached per file in `.cache/`; moving a file or renaming the drive doesn't redo them |
| Errors stay put | A file that can't be read shows its reason on that clip, with **Retry**. Everything else carries on |
| Unplugged T7 | Its clips turn **OFFLINE**; you keep editing on the previews. Plug it back in (any name) and they reconnect by themselves. Moved a file? **Relink…** on the clip |
| Proxy / Full | Under the viewer. Full plays the original files; paused, it shows an exact full-resolution frame. If the Mac can't play an original live, it says so and plays the preview |
| Export | Always from the original files at full quality, with the Mac's hardware encoder; refuses (and says which files) if a drive is unplugged |

## What Phase 3 gives you (playback)

| | |
|---|---|
| Frame-exact | The viewer decodes the previews itself (WebCodecs, on the GPU) and shows exactly the frame at the playhead, never "close enough" |
| Smooth scrubbing | Drag the ruler: any second you've already seen is instant; a new spot takes a fraction of a second |
| J / K / L | L plays, L L 2×, L L L 4× (up to 8×). J the same backwards. K stops. Hold K and tap J/L to step one frame |
| Two monitors | **Source** (left): click a clip in Media to view it, mark **I**n and **O**ut, then **Add to timeline** adds just that part. **Program** (right): your sequence. Click a monitor to make the keys drive it |
| Full quality | Decodes the original files when this Mac can (Apple Silicon: HEVC/10-bit included). Paused, it always shows an exact full-resolution frame |
| Mixer | **Mixer** tab: a level meter (dBFS, with peak hold) for every track and the master, a fader, Mute and Solo. Sound plays at normal speed (silent while shuttling, like most editors) |
| Export queue | Export MP4 adds the sequence to a queue (a snapshot, so keep editing). **Exports** shows progress, lets you cancel, and lists finished files (click to show in Finder). The queue survives a restart |

Keys: Space play/pause · J K L · ← → one frame (⇧: one second) · I / O in the source monitor ·
Home / End · S split · ⌫ delete · ⌘Z undo · ⌘E export.

## What Phase 4 gives you (pro editing)

| | |
|---|---|
| Tools | A tool bar above the timeline: **Selection V · Track select forward A · Ripple B · Roll N · Blade C · Slip Y · Slide U · Hand H · Zoom Z**. Drags show the change as a timecode (+00:12) |
| Three-point editing | Click a clip in Media, mark **I**/**O** in the Source monitor, then **,** Insert (pushes what follows) · **.** Overwrite · **⇧E** Append · **⇧R** Replace the selected clip. Mark **I**/**O** on the timeline too (click the Program monitor first), then **;** Lift (leaves a gap) or **'** Extract (closes it). **X** marks the clip under the playhead |
| Deleting | **⌫** leaves a gap · **⇧⌫** ripple delete (closes it) · **⌥⌫** closes the gap at the playhead |
| Linked picture + sound | Insert/Overwrite put the shot's picture **and** its sound (on its own audio track) in, linked ⛓: they select, move and trim together. **⌥-click / ⌥-drag** grabs one side. **J/L cuts**: Roll tool + ⌥ on the sound's cut. If they drift out of sync, a red **+N** frames badge appears. **⌘L** links/unlinks |
| Tracks | Each track has **target** (V1/A1 buttons: where Insert/Overwrite go), **sync lock ⛓** (ripple edits move this track too; turn it off on music to protect it), Mute, Hide, Lock. Solo is in the Mixer |
| Moving around | **↑ ↓** previous/next cut · **⌥← ⌥→** nudge a frame (⇧ for 5) · **Q / W** ripple-trim the start/end to the playhead · **⇧S** snapping on/off · **⌘⇧L** linked selection on/off |
| Markers | **M** marker · **⇧C** a note **for Claude** · **⇧H** chapter · **⇧M / ⌘⇧M** previous/next · **⌥M** marker on the selected clip. The **Markers** tab: names, notes, colors, ranges, to-do ticks, and **Copy chapters** gives you YouTube chapters (with warnings if YouTube would reject them). Ask Claude "check my notes" and it works through your notes |
| Sequences | Tabs under the monitors: **+ New**, **Duplicate as version** (Main → Main v2), double-click to rename, × to delete. **⌥G** nests the selected clips into their own sequence (one clip in the timeline, picture and sound); double-click it to open |
| Clipboard | **⌘C ⌘X ⌘V** (pastes at the playhead), **⌘⇧V** paste-insert, **⌥⌘V** paste attributes (volume, fades, fit, text style). **F** match frame: opens the source at this exact frame · **⇧F** shows the clip in Media |
| Timecode | Everything is HH:MM:SS:FF. Click the timecode, or just type numbers on the timeline (`1015` = 00:00:10:15, `1:05`, `+2s`, `-15f`), then ⏎ |
| Keyboard | **⌘P** command palette: type what you want ("split all", "chapter", "Shorts"). **⌨ Shortcuts**: pick a preset (BLKGRLCO, Premiere Pro, Final Cut Pro) and click any command to give it your own key |

The default preset is Premiere's, except **S splits** (as before) and **⇧S** toggles snapping. In the
Premiere preset ⌘K splits and S toggles snapping; in the FCP preset ⌘B splits, W/D/E insert/overwrite/append.

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
| `.cache/` | Previews, thumbnails, filmstrips, waveforms + an index (safe to delete; they're remade) |

The default `project/` folder is gitignored (this repo is public).

## Development

`npm run dev` (hot reload, browser at :5310) · `npm run app` (build + open the Mac app) ·
`npm test` · `npm run test:electron` · `npm run typecheck` · `npx tsx scripts/bge.ts summary`.
