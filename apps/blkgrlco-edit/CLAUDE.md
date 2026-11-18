# BLKGRLCO Edit — how Claude edits the timeline

The whole edit lives in **one file: `project/timeline.json`** (or `<dir>/timeline.json`
if the app was started with `--project <dir>`; the path is printed when the server starts
and returned as `projectDir` by `GET http://localhost:5310/api/state`).

When Omnia asks for an edit ("cut the first 3 seconds of clip 2", "add a title at 0:05",
"turn the music down under the confession"), **edit that JSON file directly**. The running
app watches it and redraws her timeline within a fraction of a second, with the change shown
in the Activity panel as **Claude** and the touched clips glowing. There's no API to call.

## Every edit, in this order

1. **Read the file fresh.** She may have just dragged something. Never edit from memory.
   `node apps/blkgrlco-edit/scripts/summary.js` prints every clip with its timeline position.
2. To see what *she* changed recently: `tail -n 20 apps/blkgrlco-edit/project/activity.jsonl`
   (one JSON line per change; `author` is `you` = Omnia, `claude`, or `app`).
3. Change only what was asked. Keep everything else byte-for-byte (other clips, ids, media).
4. Write the whole file back as valid JSON (2-space indent). Write it in one go — the app
   ignores a half-written file, but a broken file shows her an error banner.
5. Run `node apps/blkgrlco-edit/scripts/summary.js` again: it must end with `✓ valid`.
   If it doesn't, fix it immediately. The app keeps showing the last good version until you do.
6. Tell her in one line what changed, with clip ids and times (e.g. "c2 now starts 3 s later
   into the shot; c3–c5 moved left 3 s to close the gap").

Don't edit `activity.jsonl`, `.cache/`, `exports/` or anything in `media/`.

## Schema (version 1)

All times are **seconds** (numbers, up to 3 decimals). Timecodes she says map as
`0:05` → `5`, `1:02.5` → `62.5`.

```jsonc
{
  "version": 1,
  "project": {
    "name": "Mexico City weekend",
    "width": 1080, "height": 1920,   // output frame; @blkgrlco is vertical 1080×1920
    "fps": 30,
    "background": "#000000"          // shows where no video covers the frame
  },
  "media": [                         // the app fills this from media/ via ffprobe. READ-ONLY.
    { "id": "m1", "file": "IMG_4532.MOV", "type": "video",   // video | audio | image
      "duration": 43.0,              // seconds (null for images)
      "width": 1080, "height": 1920, "fps": 30, "hasAudio": true }
  ],
  "tracks": [                        // array order = layer order: first is the BOTTOM layer
    {
      "id": "v1", "kind": "video",   // video | audio | text
      "name": "Video 1",
      "muted": false,                // video/audio: silence the whole track
      "hidden": false,               // video/text: hide the picture/text
      "clips": [
        // media clip (video or audio track)
        { "id": "c1", "media": "m1",
          "start": 0,                // where it sits on the timeline
          "in": 2.0, "out": 7.5,     // which part of the source plays (out > in, out ≤ duration)
          "volume": 1,               // 0–4 (1 = as recorded, 0 = silent)
          "fit": "cover",            // video tracks: cover (fill + crop) | contain (whole frame, bars)
          "fadeIn": 0, "fadeOut": 0  // seconds; video fades to/from the layer below, audio fades volume
        }
      ]
    },
    {
      "id": "t1", "kind": "text", "name": "Titles",
      "clips": [
        // text clip (text track only): no media/in/out, has duration
        { "id": "c3", "start": 5, "duration": 3, "text": "day 21",   // "\n" for line breaks
          "style": {
            "font": "default",       // "default" (Arial) or a font key, see Fonts below
            "size": 120,             // px at the project's resolution
            "color": "#A8B118",
            "x": 0.5, "y": 0.15,     // anchor point as a fraction of width/height (0–1)
            "align": "center",       // left | center | right (relative to x)
            "bold": true,            // only affects "default"
            "shadow": false
          },
          "fadeIn": 0.2, "fadeOut": 0.2 }
      ]
    }
  ],
  "nextId": 4                        // next clip id number
}
```

**Derived values:** a media clip's length on the timeline is `out − in`; it covers
`start` → `start + (out − in)`. A text clip covers `start` → `start + duration`.
The video's total length is the end of the last clip on any track.

**Rules the app enforces** (break one and it refuses the file):
- Clip ids are unique across all tracks. New clips take `"c" + nextId`, then bump
  `nextId` by 1. **Ids are never reused or renumbered**, even after deletes.
- Every media clip's `media` must be an id in `media`; `0 ≤ in < out ≤ media.duration`.
- Video tracks take video and image media; audio tracks take audio and video media (its sound);
  images have no `in`/`out` limit (use `in: 0, out: <seconds to show>`).
- `start ≥ 0`. Text clips need `text` and `duration > 0`.
- Overlapping clips on one track are allowed but flagged as a warning. Avoid them unless asked.

## What she means → what to change

**"clip 2"** means the clip with id **`c2`** — every clip shows its id in the timeline.
If she says "the second clip" (an ordinal, no id), count clips on Video 1 by `start`,
and say which id you picked.

| She says | Edit |
|---|---|
| "cut the first 3 seconds of clip 2" | `c2.in += 3`. Then **close the gap**: every later clip on the same track moves left 3 s (`start -= 3`). Don't move other tracks unless she asks; mention if music/titles now sit differently. If she says "leave a gap" / "don't move anything", only change `in` and add 3 to `start`. |
| "cut the last 2 seconds of c4" | `c4.out -= 2`, then move later clips on that track left 2 s. |
| "trim c5 to 4 seconds" | `out = in + 4` (ripple later clips by the difference). |
| "split c3 at 0:12" | Left keeps id: `out = in + (12 − start)`. New clip `c<nextId>`: same fields, `start: 12`, `in` = left's new `out`, original `out`. Left `fadeOut: 0`, right `fadeIn: 0`. |
| "delete c6" / "remove the croissant shot" | Remove it from its track; close the gap on that track unless told not to. Identify by media `file` when she names a shot. |
| "move c7 to 0:30" | `c7.start = 30`. |
| "swap c2 and c3" | Exchange their positions on the track (keep each clip's length; re-pack them back to back). |
| "add a title at 0:05" | New text clip on the first text track: `start: 5, duration: 3`. Text = what she said, or ask if she didn't say. |
| "add the label card 'gym' at 1:10" | @blkgrlco label card (locked spec): text `"gym"` (lowercase), `font: "Arial Rounded Bold"`, `size: 170`, `color: "#A8B118"`, `x: 0.5, y: 0.5`, `align: "center"`, about 1.5 s. |
| "Day 21 overlay for the whole short" | Text clip `start: 0`, `duration` = total length, top of frame (`y` ≈ 0.08), clear of her face and captions. |
| "music down to 30% under c4" | Split the music clip at c4's start and end, set the middle part's `volume: 0.3`. Or the whole clip if she means all of it. |
| "mute c2" | `c2.volume = 0`. |
| "fade the music out over 2 s" | `fadeOut: 2` on the last music clip. |
| "fit the whole frame" / "no crop" | `fit: "contain"` (adds bars; @blkgrlco delivery rule is *no pillarboxing*, so flag it). |
| "add IMG_4555.MOV after c5" | Find its media id (if it isn't in `media`, it isn't in `media/` yet; ask her to drop it in); add `{ id: "c<nextId>", media, start: end of c5, in: 0, out: duration, volume: 1, fit: "cover" }` on c5's track. |
| "add a video/audio/text track" | Append `{ id: "v2"/"a2"/"t2" (unused), kind, name, muted: false, hidden: false, clips: [] }`. Later video tracks draw on top. |

When an instruction is ambiguous (which clip, ripple or not, how long a title stays up),
make the sensible choice above and **say what you chose**; don't stall.

## Fonts

`style.font` is a key from `GET /api/state` → `fonts` (file name without extension). It
includes everything in `brand-bible/brands/assets/fonts/` and `project/fonts/`, plus system
fonts like `Arial Rounded Bold` on the Mac. Brand fonts:

| Key | Use |
|---|---|
| `AdvercaseFont-Bold` | @blkgrlco headline / thumbnail font |
| `Editor'sNote-Regular` | @blkgrlco secondary text |
| `Editor'sHand-Regular` | handwritten captions/quotes only |
| `Arial Rounded Bold` | @blkgrlco label cards (macOS system font) |

The @blkgrlco palette is `#F0DAC2 #B68A71 #B4AD7F #636407 #A8B118 #EBB9BA #8C0532 #49001B #2E1500`.
Brand rules for any cut are in `blkgrlco/RULES.md`.

## Exporting

She clicks **Export MP4**, or: `curl -X POST http://localhost:5310/api/export`. The file lands in
`project/exports/<name>-<timestamp>.mp4`, rendered from the original media (the browser preview
uses low-res proxies). Export never publishes anything anywhere.

## For working on the app itself

- `server/index.js` — Express + WebSocket + file watcher. Browser edits are `PUT /api/timeline`
  with a `baseRevision` (409 if the file changed underneath). External edits are detected by
  content hash and attributed to `claude`.
- `server/timeline.js` — validate / normalize / diff (the Activity text comes from `diffTimelines`).
- `server/export.js` — builds one ffmpeg filtergraph (overlay per video clip, drawtext per title,
  amix for audio).
- `src/ops.js` — the edit operations the UI uses (shared with tests).
- `npm test` runs unit tests and a full server + ffmpeg round trip.
