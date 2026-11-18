# BLKGRLCO Edit

A local video editor where the whole edit is one file, `project/timeline.json`, and both
Omnia and Claude Code edit it at the same time.

- **You** drag, trim, split and delete in the browser → the app writes `timeline.json`.
- **Claude** edits `timeline.json` directly → the app sees the change and your timeline
  updates within a fraction of a second, with the changed clips glowing and the change listed
  in **Activity** as *Claude*.
- **Export MP4** renders the timeline with ffmpeg from the original files.

The schema, and how Claude turns "cut the first 3 seconds of clip 2" into a JSON edit, is in
[`CLAUDE.md`](CLAUDE.md).

## Start it (on the Mac)

1. Once: `brew install node ffmpeg`
2. Double-click **`Start BLKGRLCO Edit.command`**. The first run installs and builds (about a
   minute), then opens `http://localhost:5310`. If macOS blocks it, right-click → Open.
3. Put clips, music and photos in **`project/media/`** (subfolders are fine). They appear in
   the Media panel by themselves; the app makes small H.264 preview copies in the background
   (DJI D-Log M is often 10-bit HEVC, which browsers can't play). Your originals are never changed.
4. To edit together, open Claude Code in this repo on the same Mac and ask for edits in plain
   words. Claude has to run where the file is: a cloud session can't see your Mac's disk.

To work on a different folder (e.g. a video's folder on the T7):
`./"Start BLKGRLCO Edit.command" "/Volumes/Untitled/project hhh/<video>/edit"` — that
folder gets its own `media/`, `timeline.json`, `activity.jsonl` and `exports/`.

## Using it

| | |
|---|---|
| Add a clip | Drag from Media onto a track, or double-click it (adds at the end) |
| Move | Drag the clip (also onto another track of the same kind). Edges snap to other clips and the playhead |
| Trim | Drag a clip's left or right edge |
| Split | **S** — splits the selected clip at the playhead, or every clip under the playhead if none is selected |
| Delete | **⌫** |
| Play / pause | **Space**; **← →** step a frame (**⇧** a second); click or drag the ruler to scrub |
| Undo / redo | **⌘Z** / **⇧⌘Z** (your own edits; an edit from Claude clears the undo history) |
| Zoom | **+ / −**, the slider, or ⌘-scroll on the timeline |
| Text | **T Add text** at the playhead; set font, size, color, position in the Clip panel |
| Fades, volume, fit | Clip panel |

If `timeline.json` is ever broken (bad JSON or an impossible value), a red banner says what's
wrong and the app keeps the last good version until it's fixed.

## Files

| Path | What |
|---|---|
| `project/timeline.json` | The edit. The only thing either of you edits |
| `project/activity.jsonl` | Who changed what, one JSON line per change |
| `project/media/` | Your source files (read-only to the app) |
| `project/fonts/` | Extra fonts (the brand fonts in `brand-bible/` are already included) |
| `project/exports/` | Rendered MP4s |
| `project/.cache/` | Thumbnails, waveforms, preview proxies (safe to delete) |

`project/` is gitignored: this repo is public, so footage and edits never get committed.

## Development

`npm run dev` (Vite hot reload on :5310) · `npm test` (unit tests + a real server/ffmpeg round
trip) · `node scripts/summary.js` (prints and checks the current timeline).
