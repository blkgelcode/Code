# BLKGRLCO Edit — how Claude edits the timeline

The whole edit lives in **one file: `<project>/timeline.json`**. The project folder is
`apps/blkgrlco-edit/project/` unless the app was opened on another folder (e.g. on the T7);
the running app reports it as `projectDir` in `GET http://localhost:5310/api/state`, and
`bge` takes `--project <dir>`.

When Omnia asks for an edit ("trim clip 3", "add a title at 0:05", "move c7 to 0:30"),
**edit `timeline.json` directly.** The app sees the change within a fraction of a second,
redraws her timeline, makes the touched clips glow, shows "Claude is editing…", and records the
change in History as **Claude's** — so she can see it and either of you can undo it.

`bge` is your command line (run from `apps/blkgrlco-edit/`, or `npm --prefix apps/blkgrlco-edit run bge -- <cmd>`):

| Command | What it does |
|---|---|
| `npx tsx scripts/bge.ts summary` | every clip with its timeline position, per sequence (works with the app closed) |
| `npx tsx scripts/bge.ts check` | validate the file exactly as the app does (must say `✓ valid`) |
| `npx tsx scripts/bge.ts history 20` | the last 20 changes: rev, who (Omnia / Claude / app), what |
| `npx tsx scripts/bge.ts undo` / `redo` | undo/redo **your own** (Claude's) last change |
| `npx tsx scripts/bge.ts revert <rev>` | undo one specific change by anyone, if nothing later depends on it |
| `npx tsx scripts/bge.ts restore <rev>` | make the timeline look like it did at `<rev>` (recorded as a new, undoable change) |
| `npx tsx scripts/bge.ts status "trimming c3"` | show "Claude is trimming c3…" in her app (3 min, or `status` with no text clears it) |
| `npx tsx scripts/bge.ts import <path…>` | add files/folders to the media list **by path** (never copied) |

## Every edit, in this order

1. **Read the file fresh** (`bge summary`, or read the JSON). She may have just dragged
   something; never edit from memory or from an earlier read.
2. For a multi-step edit, `bge status "what you're doing"` first so she knows not to touch it.
3. Change only what was asked. Leave every other value, id and clip exactly as it is.
4. Write the whole file back as valid JSON. The app rewrites it in canonical form afterwards
   (snapped to frames, defaults filled, clips sorted by `start`), so **re-read before a second edit.**
5. `bge check` must end with `✓ valid`. If it doesn't, fix it right away: until then her app shows a
   red banner and keeps the last good version.
6. Tell her in one line what changed, with clip ids and times.

"Undo that" from her about **your** change → `bge undo`. About **her** change → she presses ⌘Z
(or `bge undo --as you`). About a specific change → `bge history`, then `bge revert <rev>`.
Undo is refused, with the reason, if someone changed the same thing afterwards; say so and ask.

Don't edit `.history/`, `activity.jsonl`, `.cache/`, `exports/`, or the media files themselves.

## Schema (version 2)

Times are **seconds** (numbers). Timeline positions/lengths are snapped to the sequence's frame
grid (1/30 s at 30 fps → `5.033333`). Timecodes she says: `0:05` → `5`, `1:02.5` → `62.5`.

```jsonc
{
  "version": 2,
  "project": { "name": "Mexico City weekend", "brand": "blkgrlco" },   // brand: blkgrlco | blkgrlcotoo | podcast | null
  "media": [                         // READ-ONLY: the app writes these at import (`bge import`). Never hand-edit.
    { "id": "m1",
      "path": "/Volumes/Untitled/project hhh/mx/DJI_0245.MP4",   // absolute; used in place, never copied
      "name": "DJI_0245.MP4",
      "type": "video",                // video | audio | image
      "duration": 152.4,              // seconds (null for images)
      "width": 3840, "height": 2160,  // as displayed (rotation already applied)
      "fps": 59.94, "hasAudio": true, "codec": "hevc", "audioCodec": "aac",
      "bitDepth": 10, "hdr": "hlg",   // hdr only on HDR footage (iPhone); previews/exports are tone-mapped to SDR
      "rotation": 90, "vfr": true,    // only when present
      "camera": "DJI", "createdAt": "2026-09-26T13:24:02.000Z", "size": 1203384012,
      "fingerprint": "6746919df96876fa619d",                         // identifies the footage even if moved
      "volume": { "uuid": "…", "name": "Untitled", "rel": "project hhh/mx/DJI_0245.MP4" } }  // external drive
  ],
  "sequences": [                     // a project can hold several cuts, e.g. the master and the Short
    { "id": "s1", "name": "Main",
      "width": 1080, "height": 1920, "fps": 30, "background": "#000000",
      "tracks": [                    // array order = layer order: FIRST track is the BOTTOM layer
        { "id": "v1", "kind": "video", "name": "Video 1",            // kind: video | audio | text
          "muted": false, "hidden": false, "locked": false,          // locked = she doesn't want it touched
          "clips": [
            { "id": "c1", "media": "m1",
              "start": 0,              // position on the timeline
              "in": 2.0, "out": 7.5,   // the part of the source that plays (0 ≤ in < out ≤ duration)
              "volume": 1,             // 0–4
              "fit": "cover",          // video tracks: cover (fill + crop) | contain (whole frame, bars)
              "fadeIn": 0, "fadeOut": 0,
              "label": "the confession" }  // optional note shown on the clip
          ] },
        { "id": "t1", "kind": "text", "name": "Titles", "muted": false, "hidden": false, "locked": false,
          "clips": [
            { "id": "c3", "start": 5, "duration": 3, "text": "day 21",   // "\n" for a line break
              "style": { "font": "default", "size": 120, "color": "#A8B118",
                         "x": 0.5, "y": 0.15, "align": "center", "bold": true, "shadow": false },
              "fadeIn": 0.2, "fadeOut": 0.2 } ] }
      ] }
  ],
  "activeSequence": "s1",            // the sequence shown in her timeline
  "nextId": 4                        // number for the next new clip id
}
```

A media clip covers `start` → `start + (out − in)`; a text clip `start` → `start + duration`.
Every object is **strict**: an unknown or misspelled field (`"strat"`) is rejected with its name.

**Rules** (the app refuses a file that breaks one, and tells you which clip and field):
- Clip ids are unique across **all** sequences. A new clip gets `"c" + nextId`, then add 1 to
  `nextId`. Ids are never reused or renumbered, so "clip 3" always means `c3`.
- `media` must be an id in `media`. `0 ≤ in < out ≤ duration` (images: any `out`).
- Video tracks take video/image media; audio tracks take audio, or video for its sound.
- Text clips go on text tracks, media clips on video/audio tracks.
- Track ids are unique within a sequence; sequence ids are unique; `activeSequence` must exist.
- Overlaps on one track are allowed but warned about. Avoid them unless asked.
- **Don't edit clips on a `locked` track** — tell her it's locked.

## What she says → what to change

**"clip 3"** = `c3` (ids are on every clip in her timeline). An ordinal without an id
("the second clip") = count clips on the bottom video track of the active sequence by `start`;
say which id you picked. Work in the **active sequence** unless she names another ("in the Short").

| She says | Edit |
|---|---|
| "trim clip 3" / "cut the first 3 seconds of clip 3" | `c3.in += 3`, then **close the gap**: later clips on the same track move left 3 s. If she says "leave a gap", only change `in` and add 3 to `start`. |
| "cut the last 2 seconds of c4" | `c4.out -= 2`; later clips on that track move left 2 s. |
| "make c5 4 seconds long" | `out = in + 4` (ripple later clips by the difference). |
| "split c3 at 0:12" | Left keeps id: `out = in + (12 − start)`. New clip `c<nextId>`: copy of c3 with `start: 12`, `in` = left's new `out`, original `out`. Left `fadeOut: 0`, right `fadeIn: 0`. |
| "delete c6" / "remove the croissant shot" | Remove it; close the gap on that track unless told not to. Find a shot by its media `name`. |
| "move c7 to 0:30" | `c7.start = 30`. To another track: move the object to that track's `clips`. |
| "swap c2 and c3" | Exchange positions; keep each clip's length; re-pack back to back. |
| "add a title at 0:05" | New text clip on the first text track: `start: 5, duration: 3`. |
| "add the label card 'gym' at 1:10" | @blkgrlco label card (locked): `text: "gym"` (lowercase), `font: "Arial Rounded Bold"`, `size: 170`, `color: "#A8B118"`, centered, ~1.5 s. |
| "Day 21 overlay on the whole Short" | Text clip `start: 0`, `duration` = sequence length, `y` ≈ 0.08, clear of her face/captions. |
| "music down to 30% under c4" | Split the music clip at c4's start/end; middle part `volume: 0.3`. |
| "mute c2" / "fade the music out over 2 s" | `c2.volume = 0` / `fadeOut: 2` on the last music clip. |
| "add IMG_4555.MOV after c5" | Find it in `media` (if missing: `bge import <path>`); new clip `{ id: c<nextId>, media, start: end of c5, in: 0, out: duration, volume: 1, fit: "cover" }`. |
| "make a Shorts version" | Copy the sequence: new `id` (`s2`), `name: "Shorts"`, every clip gets a new `c<nextId>` id; set `activeSequence` to it. |
| "switch to the Short" | `activeSequence = "<its id>"`. |
| "undo that" | Yours: `bge undo`. Hers: she presses ⌘Z. Specific: `bge history` → `bge revert <rev>`. |
| "go back to how it was this morning" | `bge history 100`, find the rev, confirm with her, `bge restore <rev>`. |

When something's ambiguous, make the sensible choice above and **say what you chose**.

## Fonts and brand

`style.font` is a key from `/api/state` → `fonts` (file name without extension); brand fonts
come from `brand-bible/brands/assets/fonts/`, extras from `<project>/fonts/`, plus macOS
system fonts. @blkgrlco: `AdvercaseFont-Bold` (headlines), `Editor'sNote-Regular` (secondary),
`Editor'sHand-Regular` (handwritten only), `Arial Rounded Bold` (label cards). Palette:
`#F0DAC2 #B68A71 #B4AD7F #636407 #A8B118 #EBB9BA #8C0532 #49001B #2E1500`.
Brand rules for any cut: `blkgrlco/RULES.md`.

## Footage, previews and offline drives

- Footage is **referenced by path**, never copied. `bge import <file-or-folder…>` adds it; folders
  are read recursively; unreadable files are reported, not added.
- The app makes a **preview (proxy)** for every video in the background: 960×540 H.264 (540×960
  vertical), a keyframe every second, on the Mac's hardware encoder. Thumbnails, filmstrips and
  waveforms too. At most 2 at a time, clips already on a timeline first, cached forever by
  fingerprint in `<project>/.cache/`. Status: `GET /api/media/status` (per media: `proxy.state` =
  queued | running (+progress) | ready | error (+error)), and `online`.
- She can only drag a video onto the timeline once its preview is ready. **You can add clips to the
  JSON at any time** — they show "preview queued/NN%" until it's ready. That's fine; say so.
- If a drive is unplugged, its clips go **offline**: editing continues on the proxies, but export
  refuses (it needs the originals). When the drive comes back — under any name, e.g. "Untitled 1" —
  the app reconnects it by volume UUID and records it in History as the app. A file that was moved
  can be relinked from the bin (she clicks Relink…), or `curl -X POST /api/media/<id>/relink -d '{"path":"…"}'`.
  Never edit a media `path` by hand.

## Exporting

She clicks **Export MP4** (⌘E), or `curl -X POST http://localhost:5310/api/export`. It renders
the active sequence from the **original** files at full quality (hardware decode + hardware H.264
encode on the Mac; HDR tone-mapped to SDR) into `<project>/exports/`. Nothing is ever published.

## How the app keeps both of you safe (so you know what to expect)

- Every change — hers, yours, an undo — is stored in `.history/log.jsonl` as operations that
  record what they replaced. Her drag and your file edit merge when they touch different things;
  if you both changed the *same* value, the later one is refused with a message, never silently lost.
- ⌘Z undoes **her** last change only; `bge undo` undoes **yours** only. Undo, revert and restore are
  themselves new history entries, so they can be undone too.
- `timeline.json` is written atomically and fsynced. If it's ever damaged, the app restores the last
  good version from history on start and keeps the damaged file as `timeline.json.broken-<time>`.
  Edits made while the app was closed are picked up on start and recorded as Claude's.
- The Mac app restarts its server automatically if it crashes; the page reconnects by itself.

## For working on the app itself

`PLAN.md` has the roadmap. Code map: `shared/model.ts` (zod schema, validate, normalize, migrate),
`shared/ops.ts` (ops, diff, describe), `shared/precondition.ts` (merge/undo safety),
`server/store.ts` (file + history + recovery), `server/index.ts` (HTTP/WebSocket/watcher),
`server/export.ts`, `server/media/` (probe, fingerprint, caps, volumes, engine = job queue +
offline), `src/` (React UI; `src/edit.ts` = editing operations, `src/media.ts` = media status),
`electron/` (Mac shell).
`npm test` (unit + full server/ffmpeg round trip), `npm run test:electron` (Mac app smoke test),
`npm run typecheck`, `npm run dev` (hot reload), `npm run app` (build + open the Mac app).
