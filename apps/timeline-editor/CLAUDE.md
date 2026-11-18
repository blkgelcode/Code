# Timeline Editor — instructions for Claude Code

The whole edit lives in **`project/timeline.json`** (or `$PROJECT_DIR/timeline.json`).
Her browser and Claude edit the same file, live:

- When she asks for an edit ("trim clip 3", "add a title at 0:05"), make it
  with the **`tl` command** (preferred: it uses the same operations as the UI,
  keeps linked picture and sound together and refuses overlaps), or edit
  `timeline.json` directly with the Edit tool. Either way her browser updates
  at once, highlights the change and logs it in Activity as **Claude**.
- **Read the current state first, every time**: `npm run tl -- show`. She may
  have changed things since you last looked.
- To see what she just did: `npm run tl -- history`, or the end of
  `project/activity.jsonl` (`{"ts","rev","seq","author":"user"|"claude"|"app","changes":[{"text","clipIds"}]}`).
- **Everything is undoable, for both of you.** If she says "undo that" or
  "undo what you did": `npm run tl -- undo` (the latest change, by anyone) or
  `npm run tl -- undo --seq 12` (one specific change, if nothing later touched
  the same clips). `npm run tl -- redo` puts it back.
- After a raw JSON edit, run **`npm run validate`**. An invalid file pauses
  editing in her browser until it's fixed (she gets a "Restore the last good
  version" button), so fix it at once.
- Never modify, move or copy her media files. Export reads the originals.
- Commands run from `apps/timeline-editor/`. If she started the app with
  `PROJECT_DIR=…`/`MEDIA_DIR=…`, use the same variables.

## The `tl` command

| She says | Command |
|---|---|
| "show me the timeline" | `npm run tl -- show` |
| "cut the first 3 seconds of clip 2" | `npm run tl -- trim c2 --start +3` |
| "cut the last 2 seconds of clip 4" | `npm run tl -- trim c4 --end -2` |
| "use 0:10–0:14 of the source for clip 3" | `npm run tl -- trim c3 --in 10 --out 14` |
| "move clip 5 to 0:20" | `npm run tl -- move c5 0:20` (`--track v2` to change track) |
| "split clip 2 at 0:07" | `npm run tl -- split c2 0:07` |
| "delete clip 6" / "and close the gap" | `npm run tl -- delete c6` / `… --ripple` |
| "add a title 'good morning' at 0:05" | `npm run tl -- title "good morning" --at 0:05 --duration 3` |
| "put DJI_0007 at 1:10" | `npm run tl -- add m5 --at 1:10` (import it first if needed) |
| "music quieter", "fade clip 4 out" | `npm run tl -- set c4 volume=0.3` / `set c4 fadeOut=1` |
| "change the title text / color" | `npm run tl -- set c12 text="hello" style.color=#A8B118` |
| "J-cut: start the sound of clip 7 a second early" | `npm run tl -- trim c7a --start -1 --unlinked` (only the sound clip moves its edge) |
| "unlink clip 3" | `npm run tl -- unlink c3` |
| "this clip isn't D-Log M" / "it is" | `npm run tl -- lut m5 none` / `lut m5 dlogm` |
| "this is for @blkgrlco" | `npm run tl -- channel @blkgrlco` (sets the look: The Everyday LUT) |
| "no LUT look" / back to the channel's | `npm run tl -- look none` / `look channel` |
| "undo", "undo your last change", "redo" | `npm run tl -- undo` · `undo --seq N` · `redo` |
| "save a version before you start" | `npm run tl -- version "before rough cut"` |
| "go back to that version" | `npm run tl -- versions`, then `npm run tl -- restore <id>` |
| "import the footage from the T7" | `npm run import -- "/Volumes/T7/project hhh/seoul"` |
| "export it" | `npm run export` → `project/exports/` |

`--unlinked` on `move`, `trim`, `split` and `delete` acts on one clip alone,
not its linked partner (that's how J and L cuts are made). Times: `12.5`,
`0:05`, `1:02.5`; `+3`/`-2` are relative to the clip's current edge or start.
Before a big change (rough cut, AI helper), save a version first.

After an edit, tell her in one line what changed, with the clip ids and
times, so she can find it in Activity.

## How she refers to things

- **"Clip 2" means the clip with id `c2`.** Ids are printed on every clip.
  A clip's linked sound is usually `c2a` or the next id; `tl show` lists
  `link` pairs. If no `c2` exists, ask.
- "Track 1" / "Video 1" / "the music track": match `name` or `id`; ask if unclear.
- "The playhead" isn't in the file. Ask for the time.

## Schema (version 2)

**All times are in seconds.** "0:05" = 5, "1:30" = 90.

```jsonc
{
  "version": 2,
  "project": {
    "name": "Seoul vlog",
    "channel": "@blkgrlco",        // @blkgrlco | @blkgrlcotakesoff | podcast | null
    "look": "channel"              // "channel" (its LUT), "none", or a path to a .cube
  },
  "media": [                        // written by import; don't invent entries
    { "id": "m1", "file": "/Volumes/T7/footage/DJI_20261118093012_0007_D.MP4",  // absolute, or relative to media/
      "kind": "video",              // video | audio | image
      "duration": 12.48, "width": 3840, "height": 2160, "fps": 59.94,
      "codec": "hevc", "bitDepth": 10, "hdr": "HLG", "rotation": 90,      // when present
      "hasAudio": true, "audioCodec": "aac", "size": 1203948576,
      "logProfile": "dlogm" }       // "dlogm" | "none": D-Log M → Rec.709 conversion
  ],
  "sequences": [ {
    "id": "s1", "name": "Main",
    "settings": { "width": 1920, "height": 1080, "fps": 59.94, "background": "#000000" },
    "tracks": [                     // display order, top to bottom; higher = drawn on top
      { "id": "t1", "kind": "text", "name": "Text 1", "hidden": false, "clips": [
        { "id": "c3", "start": 5, "duration": 3, "text": "good morning",
          "style": { "font": "Arial", "size": 96, "color": "#ffffff", "x": 0.5, "y": 0.85,
                     "align": "center", "box": null },
          "fadeIn": 0.2, "fadeOut": 0.2 } ] },
      { "id": "v1", "kind": "video", "name": "Video 1", "hidden": false, "clips": [
        { "id": "c1", "media": "m1", "start": 0, "in": 2.5, "out": 8, "link": "L1",
          "fit": "cover", "fadeIn": 0, "fadeOut": 0.5,
          "color": { "input": "auto", "look": "project" } } ] },
      { "id": "a1", "kind": "audio", "name": "Camera audio", "muted": false, "volume": 1, "clips": [
        { "id": "c2", "media": "m1", "start": 0, "in": 2.5, "out": 8, "link": "L1",
          "volume": 1, "fadeIn": 0, "fadeOut": 0.5 } ] }
    ],
    "markers": []
  } ],
  "mainSequence": "s1"
}
```

| Where | Field | Meaning |
|---|---|---|
| media clip | `start` | Where it begins on the timeline |
| media clip | `in`, `out` | The part of the source played (source seconds). Length = `out − in`; `out` ≤ media `duration` |
| any clip | `link` | Clips sharing a link id are one picture + its sound: they move, trim, split and delete together |
| audio clip | `volume` | 1 = as recorded, 0 = silent, up to 2. **Video clips have no volume in v2**: their sound is the linked audio clip |
| video clip | `fit` | `cover` fills and crops; `contain` shows the whole frame |
| video clip | `color.input` | `auto` (convert if the media is D-Log M), `dlogm` (force), `none` (keep flat) |
| video clip | `color.look` | `project` (the project's look) or `none` |
| text clip | `style.x`, `style.y` | Anchor as a fraction of the frame; (0.5, 0.85) = lower third |
| any clip | `fadeIn`, `fadeOut` | Seconds; picture to transparent, sound in volume, text in opacity |
| track | `hidden` (video, text), `muted`/`volume` (audio) | |
| media | `logProfile` | Set on import: DJI files (`DJI_YYYYMMDDhhmmss_NNNN_D…`) are `dlogm`, because DJI tags D-Log M as bt709 |

**Color order (brand bible):** D-Log M → Rec.709 conversion
(`brand-bible/brands/assets/luts/dji-pocket3/…`), then the look (The Everyday
LUT for @blkgrlco and @blkgrlcotakesoff), at source resolution. The preview
proxies already have the conversion baked in; the look is applied on export
(its live preview comes in the Color phase).

**Rules the validator enforces:** unique ids everywhere (new clips: the next
unused `cN`; links: `LN`); clips on one track never overlap; picture media on
video tracks, sound on audio tracks; `0 ≤ in < out ≤ duration`.

**v1 files** (top-level `settings`/`tracks`) are upgraded automatically when
the app starts; the original is kept under Versions.

## History, autosave, recovery

- Every change is on disk the moment it's accepted (atomic writes): there is
  no unsaved state. `.history/log.jsonl` holds each change's forward and
  inverse patch with its author; list items are addressed by id, so an old
  change can be undone after other edits.
- Autosave snapshots every 5 minutes or 50 changes (`.history/snapshots`);
  named versions in `project/versions/`. Restoring either is itself an
  undoable change.
- If `timeline.json` breaks, the last good copy is `.history/head.json`; the
  app offers to restore it. Edits made in the browser while the server was
  down are re-sent when it's back, if nothing changed meanwhile.
- `npm run dev` / `npm start` supervise the server: if it crashes it restarts
  within a second and browsers reconnect.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | The app: http://localhost:5173 (server on 5175) |
| `npm start` | Build, then serve on http://localhost:5175 |
| `npm run tl -- <command>` | Edit, undo, versions (table above; `help` lists all) |
| `npm run import [-- paths…]` | Add files/folders by path (nothing copied) |
| `npm run validate` | Check the file |
| `npm run export [-- out.mp4]` | Render from the originals |
| `npm test` | Model, history, media and exporter tests |

## How it works (for changing the app itself)

- `PLAN.md`: the full plan and phases. Phase 1 (this) is done.
- `src/lib/model.js`: schema v2, `normalize` (validation + v1 migration), edit
  operations (linked-aware), `diffTimelines` (Activity text). Shared by the
  server, the CLI and the browser. Change the schema here first, then these docs.
- `src/lib/patch.js`: change records (id-addressed patches) for undo.
- `server/history.js`: undo/redo log, snapshots, versions, last-good copy.
- `server/store.js`: reads/writes `timeline.json`, tells its own writes from
  outside edits (content hash), records history and activity.
- `server/index.js`: Express + WebSocket; `/api/undo`, `/api/redo`,
  `/api/versions`, `/api/recover`; writes `.history/server.json` so the CLI
  finds it.
- `server/tl.js`: the CLI. With the app running, edits go to the file and
  undo/versions go through the app (one history); without it, it uses the
  same History files directly.
- `server/media.js`, `library.js`, `hw.js`, `browse.js`: import by path,
  background jobs (thumbnails, waveforms, 960×540 proxies, VideoToolbox),
  offline/relink, drag-in locate.
- `server/brand.js`: LUT paths and channel looks from `brand-bible/`, D-Log M
  detection.
- `server/export.js`: one ffmpeg graph from the originals; color, overlays,
  drawtext titles, mixed audio from audio tracks.
