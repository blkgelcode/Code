# BLKGRLCO Edit — Plan (v2: a professional editor you and Claude share)

Status: **proposal, waiting for Omnia's OK.** Nothing below is built yet except Phase 0.

## 1. What we're building

A Mac video editor, modeled on Premiere Pro, Final Cut Pro and DaVinci Resolve, where:

- **The whole edit is one file, `project/timeline.json`.** You edit in the app; Claude edits the
  file. Each of you sees the other's changes immediately, and an activity log says who did what.
- **Footage is referenced by path, never uploaded or copied.** It stays on the T7, so 4K60 files
  never go through the browser or into memory. The app plays lightweight proxies and exports from
  the originals.
- **It's built around how BLKGRLCO Studios already works.** It knows your brand fonts, palette,
  label-card spec, LUT chain, the BLKGRLCO Bin moments log, `/blkgrlco-video`'s paper edits and
  `blkgrlco/RULES.md`. It never publishes anything.

## 2. Full feature list

Legend: **[P#]** = the phase that delivers it (section 5).

### Foundation
- One source of truth, `timeline.json`, watched and pushed live over WebSocket; UI edits written back [P0 ✓, P1]
- **Edits as operations, not whole-file overwrites**, so your drag and Claude's file edit landing
  at the same moment merge cleanly instead of one bouncing [P1]
- **Shared history with undo/redo for both of us:** ⌘Z undoes *your* last change; Claude can
  "undo my last change"; a History panel restores any earlier version (non-destructively, as a new
  change); any Activity entry can be reverted on its own when nothing later depends on it [P1]
- **Autosave and crash recovery:** every change is on disk the moment it's made (atomic write +
  fsync); full snapshots every 50 changes; a corrupt or half-written file is restored from the last
  good snapshot on start; the server restarts itself if it dies; the render queue resumes [P1]
- Schema v2 with automatic migration from v1 [P1]
- Native Mac app (Electron) with real file/folder pickers, drag-and-drop from Finder, menus and a
  Dock icon. It still works in a plain browser at `localhost:5310` [P1]
- Presence: "Claude is editing…" shows while Claude writes; your playhead and selection stay put
  when Claude's changes arrive [P1]
- Notes for Claude: a timeline marker with the "for Claude" type is a to-do that Claude reads and
  clears [P4]

### Media and import (your import spec, in full) [P2]
- Import files or whole folders by **path** (native picker, Finder drag-and-drop, or paste a path),
  including external drives. Nothing is copied or uploaded.
- Clips land in the bin **instantly** (placeholder card first, then ffprobe facts within about
  100 ms each: resolution, fps, duration, codec, bit depth, color space/HDR, rotation, camera).
- **Background job queue**, at most **2 jobs at once**, run at low priority (`nice`):
  thumbnail → waveform → proxy, with clips already on the timeline going first.
- **Proxies:** 960×540 (540×960 for vertical) H.264, **keyframe every 1 s**, AAC, made with
  **`h264_videotoolbox`** (Mac hardware encoder), with an automatic `libx264` fallback.
  10-bit is converted to 8-bit, and iPhone HDR (HLG / Dolby Vision) is tone-mapped to SDR.
  D-Log M **stays log** in the proxy; the color page applies the LUT, as it does on export.
- Per-clip progress bar; **a clip is usable as soon as its proxy is ready.**
- **Cache by content fingerprint** (size + first/last MB hash) in `project/.cache/`, so a file is
  never processed twice, even if it's moved or the drive is renamed.
- **Per-clip errors** (unreadable, unsupported, disk full) on that card only, with "Retry".
  Nothing crashes the app.
- **Offline / online:** when the T7 is unplugged its clips turn "offline" (a red badge on bin and
  timeline). **You keep editing on the proxies.** Export waits. Plugging the drive back in
  reconnects everything automatically, matched by volume UUID + relative path, so a drive that
  remounts as "Untitled 1" still works. Manual **Relink** is there for moved files.
- **Range-request streaming** for every proxy and original (seek without downloading).
- **Proxy / Full quality toggle** in the viewer (details in section 4).
- Handles HEVC, 10-bit, VFR iPhone, rotation metadata, DJI D-Log M, ProRes, MP4/MOV/MXF, still
  photos (incl. HEIC), WAV/MP3/AAC/AIFF.

### Media management [P5]
- **Bins** (nested folders), list and grid views, sortable **metadata columns**, **search**
  (name, codec, keywords, transcript text once captions exist).
- **Favorites, ratings, keywords and color labels;** **smart collections** (saved rules such as
  "4K, favorites, filmed 2026-09-26, has speech").
- **Source monitor** with In/Out marks, **subclips**, and **hover-scrub** filmstrips in the bin.
- **Import a BLKGRLCO Bin moments log** (`_moments.json`): your Red/Green/Orange/Purple/Yellow
  tags become color-labeled subclips and markers, and Gray spans are hidden.
- Media manager: find unused media, collect/consolidate a project onto one drive.

### Editing [P4]
- Multi-track timeline (unlimited video, audio, title and caption tracks); track lock, mute, solo,
  hide, height, target/source patching, **sync lock**.
- Tools: **Selection (V), Blade (B), Ripple (Q/W trims to playhead), Roll, Slip (Y), Slide (U),
  Track-select forward (A)**, Hand, Zoom.
- **Three-point editing:** I/O on source and timeline, **Insert (,), Overwrite (.), Append,
  Replace**; **Lift (;)** and **Extract (')**; **ripple delete (⇧⌫)**; close gaps.
- **Linked audio/video**, unlink/relink, **J-cuts and L-cuts** (Alt-drag one side), sync-offset
  badges.
- **Snapping** (toggle S) to clips, markers and playhead; nudge by frame (, .) and by 10 frames.
- **JKL shuttle** (tap L twice for 2×, K+J/L for slow jog), frame stepping, Home/End, up/down
  between edit points.
- **Markers** (sequence and clip, colors, names, notes, ranges, chapter markers → YouTube
  chapters), and marker navigation.
- **Multiple sequences per project** (e.g., the master and its Shorts cut); **nested sequences /
  compound clips** (select → Nest); duplicate a sequence as a version ("v2").
- Copy/paste clips, **paste attributes** (effects, color, audio); match frame (F); reveal in bin.
- Keyboard shortcuts with **Premiere and Final Cut presets** and an editor; all actions searchable
  (⌘K command palette).
- Timecode everywhere (HH:MM:SS:FF), frame-accurate edits; type a timecode to jump.

### Video, motion and effects [P6]
- **Transform:** position, scale, rotation, anchor, opacity, flip; **crop** (edges + feather);
  on-viewer handles.
- **Keyframes** for every numeric property, with ease in/out, bezier and hold, and a keyframe
  lane under each clip.
- **Speed:** constant (%), **speed ramps**, **reverse**, **freeze frame**, fit-to-fill, frame
  blending or optical-flow-style interpolation on slow motion.
- **Stabilization** (`vidstab`, analyzed in the background; strength and crop settings).
- Blend modes, **adjustment layers**, picture-in-picture, Ken Burns on stills.
- **Effects library:** blur (Gaussian, directional), sharpen, vignette, film grain, glow, mirror,
  chroma key, shape masks (rectangle/ellipse with feather and tracking-free keyframes), drop shadow,
  letterbox. Search and favorites.
- **Transitions library:** cross dissolve, dip to black/white, film dissolve, wipe (several
  directions), slide, push, zoom, whip pan (blur), iris, and an audio crossfade (constant power).
  Default transition (⌘T), handle-length warnings.
- **Platform safe-zone overlays** (TikTok, Reels, Shorts UI zones), title-safe and action-safe
  guides, rule-of-thirds grid.

### Color [P7]
- A **Color page** with clip thumbnails: exposure, contrast, highlights, shadows, whites, blacks,
  temperature, tint, saturation, vibrance; **lift/gamma/gain color wheels**; **RGB and hue/sat
  curves**.
- **LUTs:** an **input/camera LUT** slot (auto-suggests DJI D-Log M → Rec.709 when the camera is
  detected) and a **creative LUT** slot (The Everyday LUT for @blkgrlco, the @blkgrlcotoo kit), with
  the brand bible's two-step order enforced. Import any `.cube`.
- **Scopes:** waveform (luma/RGB), **RGB parade**, **vectorscope with skin-tone line** (your
  "natural skin tones" rule), histogram.
- Copy/paste grade, grade a group, before/after split view, still gallery for matching shots.
- Preview and export match exactly (see section 4).

### Audio [P8]
- **Mixer** with per-track faders, pan, mute/solo, **loudness meters** (LUFS + true peak).
- Clip gain, **volume and pan keyframes** (rubber bands), fades and crossfades.
- Effects: 3-band EQ, high-pass, compressor, limiter, **noise reduction** (`afftdn`, optional
  RNNoise), **de-esser**, and de-esser-as-ducking for music under VO (from your style guide).
- **Auto-ducking:** detects speech on dialogue/VO tracks and writes music volume keyframes you can
  see and edit (not a hidden effect).
- **Loudness normalization** per export preset (−14 LUFS social, −16 podcast, true peak ≤ −1 dBTP),
  measured two-pass on the final mix.
- **Sync by waveform** (external audio, VO takes, multi-camera); **record voiceover** from the
  mic straight onto a track; audio scrubbing.

### Titles, graphics and captions [P9]
- Text engine with fonts from the brand bible plus your own; stroke, shadow, background box,
  letter/line spacing; **animations** (fade, pop, slide, typewriter, word-by-word).
- **Templates:** the @blkgrlco **label card** (locked spec), **Day N overlay**, lower third, quote
  card, chapter card, end card, plus "save as template".
- **Brand kit** read from `brand-bible/` (palette swatches, fonts per brand).
- **Auto-captions with Whisper** (`whisper.cpp` with Metal on the Mac, run locally, no upload) at
  word level; a caption editor; styles (incl. the locked "bold plain white" Shorts captions,
  word highlight); keep captions off faces via the safe-zone guides. SRT/VTT export and burn-in.
- Captions are verbatim. The app never rewrites your words.

### AI helpers (Claude runs them from chat, and most also have a button) [P10]
- **Text-based editing:** delete words in the transcript to cut them from the timeline (ripple).
- **Remove silences** (threshold, minimum length, padding; preview before apply).
- **Remove filler words** ("um", "uh", repeated phrases) and **flub takes** (your "lululu" marker).
- **Find best takes:** groups repeated lines across takes and picks the last clean, complete one.
  You see the choice and the runners-up.
- **Cut on the beat:** beat/onset detection on the music track, with markers you can snap to,
  or auto-place B-roll cuts on beats.
- **Scene detection** to split long clips; **auto-reframe** 16:9 → 9:16 that follows faces (Apple
  Vision via a small helper).
- **Rough cut from notes:** Claude turns your notes, a script, a `_moments.json` log or a
  `/blkgrlco-video` paper edit (`copy/edl.md`) into a real timeline. The Mexico City EDL becomes
  an actual edit.
- **Shorts from a master:** proposes a < 3:00 vertical cut from the long-form.
- **Rules check:** runs `blkgrlco/RULES.md` checks (vertical, no pillarbox, Shorts < 3:00, label
  cards, retired terms in titles/captions) before export.
- Every AI change goes through the same history, so it can be undone like any other edit.

### Export [P3 basic, P11 full]
- **Presets:** YouTube 4K (H.264/HEVC), YouTube 1080p, **Vertical 1080×1920** (TikTok/Reels/
  Shorts), **4K master ProRes 422 HQ**, audio WAV/MP3, **podcast MP3 (−16 LUFS, ID3)**, captions
  (SRT/VTT), YouTube chapters text, still frame/thumbnail frames, and **FCPXML/EDL** to open the
  cut in Resolve or Premiere.
- **Render queue:** multiple jobs, persisted (survives a restart), pause/cancel, progress and ETA,
  in/out range export, a notification when done, and a post-export check report (resolution,
  loudness, duration, `verify.py`).
- **Always from the original files at full quality**, with hardware encoding
  (`h264_videotoolbox`, `hevc_videotoolbox`, `prores_videotoolbox`) and a software fallback.
  Waits with a clear message if a drive is offline.

### Performance [P3, P6]
- GPU everywhere: hardware decoding (WebCodecs/VideoToolbox), a WebGL2 compositor, hardware encoding.
- **Smooth 4K60 scrubbing** by working on proxies with 1 s keyframes, a decoded-frame cache
  around the playhead, and decode-ahead in a worker.
- **Background rendering** of heavy sections (stabilized, speed-ramped, stacked effects) to cached
  intermediates, with a render bar (red/yellow/green) like Premiere's.
- The UI never blocks: all media work happens in the server's job queue at low priority.

### Also added (things a pro expects that weren't on your list)
- Sequence presets per brand (vertical 1080×1920 for @blkgrlco, 16:9 for the podcast) and
  project templates.
- Review export: burned-in timecode + "DRAFT" watermark, to send around before final.
- Thumbnail frame grabs into the thumbnail workflow (real frames only, never AI, per the brand rules).
- Clip/marker comments at timecode; a "for Claude" marker type.
- Project snapshots ("Save version…") and auto-backup of `timeline.json` to a second location.
- Offline-safe: everything except export works on proxies with the drive unplugged.
- Interchange: FCPXML/EDL export, and a frame-accurate reference export for CapCut if you
  still finish there.

## 3. Tech stack, and why

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** (current stable) | A browser can't see file paths: drag-and-drop and file pickers only give the file's contents. Importing by path, which your spec requires, needs a native shell. Electron gives real paths, native dialogs, menus, a Dock icon, and runs our Node server in-process with auto-restart. Its Chromium includes the media pipeline (WebCodecs, VideoToolbox decode). Tauri or Swift would mean rewriting v1's working code in another language for no gain the user can see. The app also still runs in a normal browser for development and tests. |
| UI | **React 18 + TypeScript + Vite**, Zustand for state | v1 is already React/Vite. TypeScript is needed at this size: the schema types are shared by UI, server and Claude's tools, so a wrong field name fails at build time, not on your timeline. |
| Server | **Node 22**, Express, `ws`, `chokidar` | Continues v1. Owns the file, history, job queue and ffmpeg processes; the UI only talks to it. |
| Schema | **zod** schemas → TypeScript types + generated JSON Schema | One definition validates UI edits, Claude's file edits and migrations, and produces the reference table in CLAUDE.md, so the docs can't drift from the code. |
| Media engine | **ffmpeg / ffprobe** (Homebrew build with VideoToolbox, libvidstab, zimg) | Industry standard; hardware encode/decode on Apple Silicon; the same tool for proxies, analysis and export. |
| Job/cache index | **SQLite** (`better-sqlite3`, WAL mode) in `project/.cache/` | Crash-safe bookkeeping of fingerprints, proxy state, job queue and render queue. Kept out of `timeline.json`, which stays the edit only. |
| Preview video | **WebCodecs** + `mp4box.js` demux, **WebGL2** compositor in a worker | Decodes proxies on the GPU frame by frame (smooth scrubbing, exact frames), and composites transforms, color (as a 3D LUT texture), effects and transitions on the GPU. A `<video>` element per clip (v1's approach) can't scrub smoothly or hit exact frames. |
| Preview audio | **WebAudio** graph (gain, pan, EQ, meters) | Mixer, keyframed levels and meters in real time. |
| Graphics/titles | One **Canvas2D renderer** shared by the browser and **skia-canvas** on the server for export | The same drawing code makes the preview and the exported title frames, so titles match exactly. |
| Captions | **whisper.cpp** (Metal) | Fast, local, word timestamps. On your Mac, model download only. |
| Tests | Vitest (unit), Playwright (UI, Electron), **golden-frame tests** (preview frame vs exported frame per feature), generated fixtures including 4K60 10-bit HEVC | Proves preview and export agree, and that big files and errors are handled. |

## 4. Architecture

```
 ┌──────────────── Electron app (your Mac) ─────────────────────────────────────────┐
 │  UI (React)  ── viewer: WebCodecs decode → WebGL2 compositor ── WebAudio mixer    │
 │     │  ops (move c3 to 12.0s …)        ▲ live patches + revision + "who"          │
 │     ▼  REST / WebSocket                │                                          │
 │  Node server ── Timeline Store ── History (ops log + snapshots) ── Activity       │
 │     │              ▲  ▲                                                           │
 │     │   file watch │  │ atomic write + fsync                                      │
 │     │      project/timeline.json  ◀──── Claude Code edits this file directly      │
 │     │                                                                             │
 │     ├─ Media Library: ffprobe facts, fingerprints, volume UUIDs, online/offline   │
 │     ├─ Job Queue (max 2, nice): thumbnails · waveforms · proxies · analysis       │
 │     │        → project/.cache/{proxies,thumbs,waves,analysis,render}  + index.db  │
 │     ├─ Range server: /media/:id/proxy  /media/:id/original  (HTTP 206)            │
 │     ├─ Render queue: timeline → ffmpeg filtergraph (originals, VideoToolbox)      │
 │     └─ Tools (CLI + API): silences, beats, best takes, captions, rough cut, rules  │
 └──────────────────────────────────────────────────────────────────────────────────┘
        Footage stays where it is: /Volumes/Untitled/project hhh/…  (never copied)
```

**How live editing works.** The server holds the current timeline and a revision number. Your
actions are sent as small operations ("move c3 to 12.000", "trim c5 out to 8.2"). The server applies
them to the latest revision. They merge unless they touch the exact same property Claude just
changed, in which case you see a notice and the other change wins. Claude edits the file directly.
The server notices the content changed, works out the operations by diffing, validates, records them
as Claude's, and broadcasts. If the file is broken, you get a banner and the last good version stays
live.

**History and undo.** Every change is stored as operations plus their inverse (`.history/ops.jsonl`),
with a full snapshot every 50 changes. Undo creates a *new* change that applies the inverse, so undo
itself is undoable and nothing is ever lost. ⌘Z picks your most recent change; "undo" from Claude
picks Claude's. The History panel shows every version and can restore any of them.

**Crash safety.** `timeline.json` is written to a temp file, fsynced, then renamed into place, so it is
never half-written. On start, an unreadable file is restored from the newest snapshot plus ops, and
the bad copy is kept as `timeline.json.broken-<time>`. Electron restarts a crashed server, the UI
reconnects, and queued renders resume.

**Preview vs export parity.** Every feature exists twice: in the GPU preview and in the ffmpeg
export. To keep them identical:
- **Color** is baked into one 3D LUT per clip (camera LUT → corrections → creative LUT) that
  both sides apply.
- **Titles** come from one shared renderer.
- **Transforms, transitions and effects** use the same math, written once in GLSL and once as an
  ffmpeg expression.
- **Golden-frame tests** compare the two for every feature.

**Proxy vs Full toggle.**
- **Proxy:** the default. Smooth on anything.
- **Full:** plays the original over range requests when the Mac can hardware-decode it. Apple
  Silicon decodes HEVC 10-bit 4K60. When paused, it shows a frame-exact full-resolution still
  rendered from the original. If a codec can't be decoded live, the viewer says so and plays the
  proxy.

**Offline media.** Each media entry stores the absolute path *and* the volume UUID + path relative to
the volume. The server watches `/Volumes` and re-checks files every few seconds. A missing file means
offline (the proxy still plays). When the volume returns under any name, the path is rebuilt and the
clip comes back online.

### `timeline.json` v2 (sketch; the full reference goes in CLAUDE.md in Phase 1)

```jsonc
{
  "version": 2,
  "project": { "name": "Mexico City weekend", "brand": "blkgrlco" },
  "media": [{ "id": "m1", "path": "/Volumes/Untitled/project hhh/mx/DJI_…_0245_D.MP4",
              "volume": { "uuid": "…", "rel": "project hhh/mx/DJI_…_0245_D.MP4" },
              "type": "video", "duration": 152.4, "width": 3840, "height": 2160, "fps": 59.94,
              "codec": "hevc", "bitDepth": 10, "color": "dlog-m", "hasAudio": true,
              "bin": "b2", "rating": 5, "keywords": ["confession"], "label": "green" }],
  "bins": [{ "id": "b2", "name": "Day 2", "parent": null }],
  "smartCollections": [{ "id": "sc1", "name": "Favorites 4K", "rules": [["rating", ">=", 4], ["width", ">=", 3840]] }],
  "sequences": [{
    "id": "s1", "name": "Master", "width": 1080, "height": 1920, "fps": 30,
    "tracks": [{ "id": "v1", "kind": "video", "clips": [{
        "id": "c3", "media": "m1", "start": 12.0, "in": 11.0, "out": 28.8,
        "link": "g3",                       // linked to its audio clip
        "speed": { "rate": 1 },             // or { "ramp": [[0,1],[2.5,0.5]] }, "reverse": true
        "transform": { "x": 0, "y": 0, "scale": 1.12, "rotation": 0, "opacity": 1 },
        "crop": { "l": 0, "r": 0, "t": 0, "b": 0 },
        "color": { "inputLut": "dji-dlogm-709", "exposure": 0.1, "creativeLut": "everyday" },
        "effects": [{ "type": "vignette", "amount": 0.3 }],
        "keyframes": { "transform.scale": [[0, 1.0, "ease"], [2.0, 1.12, "ease"]] },
        "transitionIn": { "type": "dissolve", "duration": 0.5 } }] }],
    "markers": [{ "t": 6.05, "name": "confession", "color": "green", "type": "chapter" }]
  }],
  "activeSequence": "s1",
  "nextId": 120
}
```

Times stay in **seconds** (what you and Claude say out loud), snapped to the sequence's frame grid
on every write. Clip ids are still `c<N>`, never reused, so "clip 3" always means `c3`.

## 5. Phases

Each phase ends with: tests passing here, a **"How to try it"** list for your Mac, and a stop for
your feedback before the next phase starts.

| Phase | Delivers | You can test it by… |
|---|---|---|
| **0 ✓ (done)** | v1: live `timeline.json`, basic timeline, preview, export, activity, CLAUDE.md | Already in the repo |
| **1. Foundation** | Schema v2 + auto-migration, TypeScript, operations-based edits with merge, **shared history: undo/redo for both of us, History panel, revert any entry**, autosave + **crash recovery**, Electron shell (native picker, Finder drag-drop paths, menus), presence, CLAUDE.md v2 | Drag a clip while Claude edits the same timeline; ⌘Z your change while keeping Claude's; ask Claude to undo its change; force-quit the app mid-edit and reopen; corrupt the file by hand and watch it recover |
| **2. Import & media engine** | Your whole import spec: path import, instant bin, 2-job queue, VideoToolbox proxies 960×540 / 1 s GOP, thumbnails, waveforms, filmstrips, progress bars, fingerprint cache, HEVC / 10-bit / HDR / VFR / rotation, per-clip errors, **offline/online with auto-reconnect**, relink, range streaming, Proxy/Full toggle, export from originals with VideoToolbox | Import a whole Mexico City folder from the T7; edit while proxies build; unplug the T7 mid-edit and keep working; plug it back in; check `top` stays calm |
| **3. Playback engine** | WebCodecs + WebGL2 viewer, frame cache, **JKL shuttle**, smooth scrubbing, exact frame stepping, source + program monitors, WebAudio mixer + meters, Full-quality playback path, basic export queue | Scrub a 4K60 timeline with J/K/L; compare a paused frame in Proxy vs Full |
| **4. Pro editing** | Tools (select, blade, **ripple, roll, slip, slide**, track select), **I/O three-point editing** (insert/overwrite/append/replace, lift/extract), linked A/V + **J/L cuts**, track lock/solo/sync-lock/targeting, snapping toggle, nudge, **markers** (+ chapter markers, "for Claude" notes), **multiple sequences + nesting**, paste attributes, match frame, shortcut presets (Premiere/FCP) + editor, ⌘K palette | Build a real cut with keyboard only; make a J-cut; nest the confession section; duplicate the master as a Shorts sequence |
| **5. Media management** | Bins, list/grid, metadata columns, search, favorites/ratings/keywords/labels, **smart collections**, subclips, hover scrub, **import `_moments.json`**, media manager | Import the Mexico City moments log and find every Green moment in two clicks |
| **6. Motion, speed & effects** | Transform/crop with on-viewer handles, **keyframes** + easing, **speed ramps, reverse, freeze frame**, **stabilization**, blend modes, adjustment layers, effects + transitions libraries, safe-zone overlays, background render + render bar | Ken Burns a photo; ramp the take-off clip; stabilize a walking shot; check preview = export |
| **7. Color** | Color page, wheels, curves, **camera LUT + creative LUT** (brand two-step), **scopes** incl. vectorscope skin-tone line, copy grade, compare view | Grade the DJI clips with D-Log M → Everyday LUT and check skin tones on the vectorscope |
| **8. Audio** | Mixer, keyframed levels/pan, crossfades, EQ/compressor/**noise reduction**/de-esser, **auto-ducking**, **loudness normalization**, sync by waveform, VO recording | Duck the music under the confession; normalize to −14 LUFS; record a VO line |
| **9. Titles & captions** | Text engine, animations, **templates** (label card, Day N, lower third, quote, end card), brand kit, **Whisper auto-captions**, caption editor/styles, SRT/VTT, burn-in | Auto-caption the Short; drop a Day 21 overlay and a label card from templates |
| **10. AI helpers** | Text-based editing, **remove silences**, filler/flub removal, **best takes**, **cut on beat**, scene detect, auto-reframe, **rough cut from notes / moments / EDL**, Shorts-from-master, rules check | Ask Claude: "rough-cut the Mexico City weekend from the EDL", then "remove silences in c40–c60" |
| **11. Export & delivery** | All **presets** (YouTube 4K/1080, vertical, ProRes master, audio, podcast, captions, chapters, stills, FCPXML/EDL), full **render queue** with resume, post-export checks, review export with watermark | Queue the master, the Short and a ProRes master; quit mid-render; reopen; it resumes |

## 6. Testing, and what I can't test from here

Every phase runs here: unit tests, UI tests in a headless browser, an end-to-end run against a real
server with real ffmpeg, golden-frame tests, and crash/corruption/offline simulations. Synthetic
4K60 10-bit HEVC fixtures are generated with ffmpeg.

This cloud machine is Linux, so **these need your Mac:** `h264_videotoolbox` and the other hardware
encoders (here the code falls back to software, and the tests cover both paths), real `/Volumes`
unplug/replug, Electron's native menus and drag-and-drop, HEVC hardware decoding, Metal Whisper, and
real T7 footage. Each phase ships a `run-mac-tests.command` that runs those checks on your machine
and prints a pass/fail report you can paste back to me. To build and test with you in real time on
the Mac, run Claude Code on the Mac (or attach this session to it with Remote Control).

## 7. Decisions I need from you before Phase 1

1. **Electron**, so drag-and-drop and pickers give real file paths (recommended). The alternative,
   browser-only, means typing paths or using an in-app file browser instead of Finder drag-and-drop.
2. **Phase order.** Foundation first, then your import system as Phase 2. Everything after builds on
   the v2 schema and the history, so this order avoids redoing work.
3. Keep building **in this repo** (`apps/blkgrlco-edit/`, public). Your footage, edits and caches
   stay in the gitignored `project/` folder, or in a project folder on the T7.
