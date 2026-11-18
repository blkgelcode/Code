# Timeline Editor — instructions for Claude Code

The whole edit lives in **`project/timeline.json`** (relative to this folder,
or `$PROJECT_DIR/timeline.json` if `PROJECT_DIR` is set). The browser app and
Claude edit that same file:

- When she asks for an edit ("cut the first 3 seconds of clip 2", "add a title
  at 0:05"), **edit `project/timeline.json` directly** with the Edit tool. The
  server watches the file and her browser updates within a fraction of a
  second, with your change highlighted and logged in the Activity panel as
  "Claude".
- When she drags, trims or deletes in the browser, the server rewrites the
  file. **Read the file fresh before every edit**: she may have changed it
  since you last looked.
- To see what she just did, read the end of **`project/activity.jsonl`**: one
  JSON line per change, `{"ts","rev","author":"user"|"claude","changes":[{"text","clipIds"}]}`.
- After editing, run **`npm run validate`** (from this folder). If the file is
  invalid, the app shows her the errors and pauses editing until it's fixed,
  so fix it right away.
- Never modify the files in `media/`. Export always renders from them.

Any change to the file that didn't come from the browser is labeled "Claude",
including a hand-edit in a text editor.

## Schema (version 1)

**All times are in seconds** (decimals allowed, rounded to 3 places).
"0:05" = `5`, "1:30" = `90`, "0:02.15" (frames at 30fps) ≈ `2.5`.

```jsonc
{
  "version": 1,
  "settings": {
    "width": 1920, "height": 1080,   // output frame; 1080 x 1920 for vertical
    "fps": 30,
    "background": "#000000"          // shown where no clip covers the frame
  },
  "media": [                          // written by import; don't invent entries
    { "id": "m1", "file": "DJI_0001.MP4", "kind": "video",   // video | audio | image
      "duration": 12.48, "width": 1080, "height": 1920, "fps": 29.97, "hasAudio": true }
  ],
  "tracks": [                         // display order, top to bottom
    { "id": "t1", "kind": "text", "name": "Text 1", "hidden": false,
      "clips": [
        { "id": "c3", "start": 5, "duration": 3, "text": "good morning",
          "style": { "font": "Arial", "size": 96, "color": "#ffffff",
                     "x": 0.5, "y": 0.85, "align": "center",
                     "box": null },     // or { "color": "#000000", "opacity": 0.5, "padding": 20 }
          "fadeIn": 0.2, "fadeOut": 0.2 }
      ] },
    { "id": "v1", "kind": "video", "name": "Video 1", "hidden": false, "muted": false, "volume": 1,
      "clips": [
        { "id": "c1", "media": "m1", "start": 0, "in": 2.5, "out": 8,
          "volume": 1, "fadeIn": 0, "fadeOut": 0.5, "fit": "cover" }   // cover | contain
      ] },
    { "id": "a1", "kind": "audio", "name": "Audio 1", "muted": false, "volume": 1,
      "clips": [ { "id": "c2", "media": "m2", "start": 0, "in": 0, "out": 30, "volume": 0.4 } ] }
  ]
}
```

### Fields

| Where | Field | Meaning |
|---|---|---|
| media clip | `start` | Where the clip begins on the timeline |
| media clip | `in`, `out` | The part of the source file played, in source seconds. Length on the timeline = `out − in`. `out` can't exceed the media's `duration` |
| media clip | `volume` | 1 = as recorded, 0 = silent, up to 2 |
| media clip | `fit` (video tracks) | `cover` fills the frame and crops; `contain` shows the whole picture with background around it |
| text clip | `start`, `duration` | When the text shows and for how long |
| text clip | `style.x`, `style.y` | Anchor point as a fraction of the frame: (0,0) top-left, (0.5,0.5) center, (0.5,0.85) lower third. `align` says which side of the text sits on `x` |
| text clip | `style.size` | Font size in output pixels |
| text clip | `style.font` / `style.fontFile` | A system font name, or a path to a .ttf/.otf (relative to this folder). No `'` or `:` in either |
| any clip | `fadeIn`, `fadeOut` | Seconds. Video and images fade to transparent (to the track below, or the background); audio fades in volume; text fades in opacity |
| track | `hidden` | Picture off (video, text). Audio from a hidden video track still plays unless `muted` |
| track | `muted`, `volume` | Sound off; or a multiplier for every clip on the track |

### Rules (the validator enforces them)

- **Ids are unique** across media, tracks and clips. New clips get the next
  unused `cN` (look at every clip id, take the highest number + 1). Never
  reuse an id. Media are `mN`; tracks `vN`, `aN`, `tN`.
- **Clips on one track can't overlap.** To layer, use another track.
- **Stacking: a track higher in the list is drawn on top.** Text tracks usually
  sit first. A video track is for video and image media; an audio track for
  audio files (or a video's sound).
- `0 ≤ in < out ≤ media.duration`. Images have no duration: any `out` works
  (it's how long the image shows).
- Keep each track's `clips` sorted by `start` (tidy, not required).

### How she refers to things

- **"Clip 2" means the clip with id `c2`.** The app prints the id on every clip
  and in the Activity panel. If no `c2` exists, ask.
- "Track 1" / "Video 1" / "the music track": match `name` or `id`; ask if unclear.
- "The playhead" isn't in the file. Ask for the time if she uses it.

## Recipes

Read `project/timeline.json` first every time; then make the change.

| She says | Change |
|---|---|
| Cut the first 3 seconds of clip 2 | `c2.in += 3`, `c2.start += 3` (the clip's end stays put; a gap opens before it) |
| …and close the gap / ripple | Also move every later clip on that track 3s earlier (`start -= 3`) |
| Cut the last 2 seconds of clip 4 | `c4.out -= 2` |
| Trim clip 3 to 0:10–0:14 of the source | `c3.in = 10`, `c3.out = 14` |
| Move clip 5 to 0:20 | `c5.start = 20` (check nothing else on that track overlaps 20 → 20 + length) |
| Split clip 2 at 0:07 | If c2 spans 7: new clip `{...c2, id: next, start: 7, in: c2.in + (7 − c2.start), fadeIn: 0}`; then `c2.out = that same in`, `c2.fadeOut = 0` |
| Delete clip 6 | Remove it from its track's `clips` |
| Add a title "good morning" at 0:05 | New clip on a text track with no clip over 5 → 8: `{ "id": next, "start": 5, "duration": 3, "text": "good morning", "style": {…defaults}, "fadeIn": 0.2, "fadeOut": 0.2 }`. If every text track is busy then, add a track `{ "id": "tN", "kind": "text", "name": "Text N", "hidden": false, "clips": [] }` at the top |
| Make clip 1 fade out | `c1.fadeOut = 0.5` (or what she says) |
| Crossfade clip 1 into clip 2 | Put c2 on a track **above** c1's, starting 1s before c1 ends, with `c2.fadeIn = 1` |
| Music quieter / duck it | Lower the audio clip's `volume` (e.g. 0.3) |
| Mute the camera sound | Set the video track's `muted: true`, or the clip's `volume: 0` |
| Make it vertical | `settings.width = 1080`, `settings.height = 1920` |
| Add a new clip from media | `npm run import` if it isn't in `media` yet; then add `{ "id": next, "media": "mN", "start": …, "in": 0, "out": <duration or less> }` to a video or audio track |
| Render it | `npm run export` → `project/exports/export-<time>.mp4`, or `npm run export -- path/out.mp4` |

After any edit: `npm run validate`, then tell her in one line what changed (the
clip ids and times), so she can find it in the Activity panel.

## Commands (run from this folder)

| Command | Does |
|---|---|
| `npm run dev` | Starts the app: http://localhost:5173 (server on 5175) |
| `npm start` | Builds, then serves everything on http://localhost:5175 |
| `npm run import` | Adds new files in `media/` to `media[]` (ffprobe for duration/size). Works with or without the app running |
| `npm run validate` | Checks the file; lists every problem |
| `npm run export [-- out.mp4]` | Renders the timeline with ffmpeg from the original files |
| `npm test` | Model and exporter tests |

If she started the app with `MEDIA_DIR=… PROJECT_DIR=…` (for example to work
straight off the T7), run the commands with the same variables, or they'll
look at this folder's `media/` and `project/`.

## How it works (for changing the app itself)

- `src/lib/model.js`: the schema's validation (`normalize`), edit operations
  (move, trim, split, delete, add) and `diffTimelines`, which writes the
  Activity text. Shared by the server and the browser. Change the schema here
  first, then this file's docs.
- `server/store.js`: reads and writes the file atomically; tells its own writes
  apart from outside edits by content hash; appends to `activity.jsonl`.
- `server/index.js`: Express + WebSocket. Browser edits arrive as
  `{type:"update", baseRev, timeline}`; a write based on an old revision is
  refused, so a browser edit never overwrites a newer change from Claude.
- `server/media.js`: import, thumbnails, 720p H.264 preview proxies (the
  browser can't play 10-bit HEVC from the Pocket 3).
- `server/export.js`: one ffmpeg filter graph. Canvas, then tracks from the
  bottom of the list up (overlay for video and images, drawtext for text),
  plus every audible clip delayed and mixed.
- Not in v1: speed changes, color grading or LUTs, keyframed motion, clip
  transitions other than fades, undo.

For BLKGRLCO Studios videos, the brand rules still apply (label cards, fonts,
the D-Log M conversion and The Everyday LUT happen outside this app for now):
see `../../brand-bible/` and `../../agents/EDITOR_AGENT_PROMPT.md`.
