# Timeline Editor — Plan

A local, professional video editor for Omnia's Mac, edited by her and Claude
Code at the same time. The whole edit lives in `project/timeline.json`.
Reference points: Premiere Pro (timeline and shortcuts), Final Cut Pro (media
organisation, favorites, roles), DaVinci Resolve (color, scopes, render queue).

Status: **plan, waiting for her OK.** Nothing below this line is built yet,
except what "Already built" lists.

---

## 1. Principles

1. **One file is the edit.** `project/timeline.json` is the single source of
   truth. The UI is a live view of it. Claude edits it directly, or through
   the `tl` command line, which uses the same operations as the UI.
2. **Never touch her footage.** Media is referenced by path, never uploaded,
   copied or modified. Export always reads the originals.
3. **Preview from proxies, export from originals.** Every effect has one
   definition with two renderers: a GPU shader for the live preview and an
   ffmpeg filter for export. Automated tests compare the two frame by frame.
4. **Nothing is lost.** Every change from either side is saved at once,
   recorded with its author, and can be undone. Crashes, unplugged drives and
   bad edits recover cleanly.
5. **Her brand is built in.** BLKGRLCO Studios rules (LUTs, fonts, palettes,
   label cards, loudness targets, retired names) come from `brand-bible/` as
   presets, so the app does the right thing by default.
6. **Each phase ships something usable.** She can edit real videos after
   every phase, not just at the end.

## 2. Already built (v1, Phase 0)

- `timeline.json` with tracks, clips, text, fades, volume; file watcher +
  WebSocket sync both ways; conflict guard (a stale browser write is refused).
- Activity panel and `project/activity.jsonl` (who changed what).
- Import by path (Import window, paste a path, drag-in by name + size),
  ffprobe metadata, background queue (2 jobs): thumbnails, waveforms, 960×540
  H.264 proxies with 1 s keyframes, VideoToolbox with software fallback,
  cache by name + size + mtime, range streaming, offline/online + auto-relink.
- Drag/trim/split/delete, titles, preview (DOM stack), Proxy/Full toggle,
  MP4 export from originals (hardware encode when available).
- `CLAUDE.md` schema and recipes; 16 automated tests.

Missing for "professional": undo, linked audio, real trim modes, monitors,
GPU preview, color (including **D-Log M**), effects, keyframes, audio tools,
captions, AI helpers, export presets, autosave/recovery.

## 3. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| UI | **React 18 + TypeScript + Vite**, Zustand for UI state | Already in use. TypeScript because the schema gets large: one set of types shared by the UI, server and `tl` CLI catches mistakes before she sees them. Migrated file by file, model first |
| Timeline | **Canvas 2D**, virtualised, tiled thumbnail/waveform caches | DOM clips get slow past a few hundred; canvas stays at 60 fps with thousands of clips and keyframes |
| Viewer (preview) | **WebGL2 compositor** + **WebCodecs** decoding of the H.264 proxies (mp4box.js demuxer) | Frame-accurate scrubbing (decode exactly the frame asked for, not "roughly where `<video>` lands"), GPU transforms, crop, color, 3D LUTs as 3D textures, transitions as shaders, scopes computed on the GPU. WebGPU later when Safari/Chrome parity is good; WebGL2 works everywhere today |
| Titles and captions | **ASS subtitles (libass)**: rendered in the browser by **JASSUB** (libass compiled to WebAssembly) and in export by ffmpeg's `ass` filter | The same engine in both places means titles look identical in preview and export. libass handles fonts, outlines, shadows, boxes, animation (move, fade, scale, rotate) and per-word karaoke highlighting for captions |
| Server | **Node 22**, Express, `ws`, chokidar | Already in use; one language across the stack; good at streaming files and supervising child processes |
| Media engine | **ffmpeg / ffprobe** (Homebrew build: VideoToolbox, libvidstab, libass, rubberband, lut3d, loudnorm) | Industry standard; the same build decodes HEVC 10-bit, iPhone and drone files, encodes with VideoToolbox (`h264_videotoolbox`, `hevc_videotoolbox`, `prores_videotoolbox`) |
| Speech | **whisper.cpp** with Metal (`brew install whisper-cpp`), large-v3-turbo model | Runs on the Mac's GPU, word-level timestamps, no upload of her audio anywhere |
| Analysis | ffmpeg `silencedetect`/`ebur128`, a Node onset/beat detector on the waveform stream, Whisper transcripts | Deterministic tools produce data; Claude (in the session) makes the editorial choices from that data |
| Mac app | **Electron** shell (Phase 10) | Gives real file paths on drag-and-drop, native menus, a Dock icon, and starts the server itself. Chromium inside has WebCodecs and H.264. Until then the app runs in Chrome at `localhost` |
| Tests | `node:test` (model, CLI, ffmpeg graphs), Playwright (UI flows), **golden-frame tests** (preview frame vs export frame, compared by PSNR) | The parity promise in Principle 3 needs proof, not hope |

Not chosen: Tauri (uses Safari's WebKit, weaker WebCodecs/WebGL video
support); a native Swift app (much slower to build together, and Claude can't
run or test it in a cloud session); a database for the edit (the whole point
is one readable JSON file).

## 4. Architecture

```
 ┌──────────────── Browser / Electron window ────────────────┐
 │ React UI ─ Canvas timeline ─ Source + Program monitors      │
 │ WebGL2 compositor ◄─ WebCodecs decoders ◄─ proxy byte ranges │
 │ JASSUB (titles/captions) ─ GPU scopes ─ audio graph (WebAudio)│
 │ Local edit queue (IndexedDB) ── WebSocket ──┐                │
 └─────────────────────────────────────────────┼───────────────┘
                                               │ state, patches, job progress
 ┌─────────────────── Node server (localhost) ─┼───────────────┐
 │ Project store ── timeline.json (atomic writes, schema check)  │
 │   ├─ History: forward/inverse JSON patches + authors (undo)   │
 │   ├─ Snapshots + named versions (autosave, recovery)          │
 │   └─ File watcher: outside edits = "Claude"                    │
 │ Media library: probe, status, offline/relink                   │
 │ Job scheduler (priorities, GPU/CPU slots, cancel, resume):     │
 │   thumbs · filmstrips · waveforms · proxies · transcripts ·    │
 │   analysis · stabilisation · background renders · exports      │
 │ HTTP: range streaming of proxies/originals, caches, exports    │
 └──────────────┬──────────────────────────┬────────────────────┘
                │ child processes           │ reads/writes
        ffmpeg · ffprobe · whisper.cpp      project/ (see below)
                ▲
 Claude Code ───┴── edits timeline.json directly, or runs `npm run tl -- …`
```

**Project folder**

```
project/
  timeline.json          the edit (sequences, media, bins, markers, captions…)
  activity.jsonl         readable log: who changed what
  .history/              patches for undo/redo, snapshots, crash journal
  versions/              named versions ("before rough cut")
  .cache/                thumbs, filmstrips, waves, proxies, transcripts,
                         analysis, stabilisation data, render cache
  exports/               finished files
```

**Undo/redo for both of us.** Every accepted change, from the UI, the `tl`
CLI or a raw edit of the file, is turned into a forward and an inverse JSON
patch (RFC 6902) and logged with its author. ⌘Z undoes the most recent change
by anyone; ⇧⌘Z redoes. The Activity panel can also undo one specific earlier
change ("undo Claude's title") when nothing later touched the same things;
otherwise it explains the clash and asks. Claude can undo with
`npm run tl -- undo` or `undo --author claude`. History survives restarts.

**Autosave and crash recovery.**
- Every change is written to disk immediately (atomic write: temp file, then
  rename), so there is no "unsaved" state.
- Snapshots every 5 minutes or 50 changes (last 50 kept, plus one per day),
  and named versions on demand.
- If `timeline.json` is unreadable at start, or an outside edit broke it,
  editing pauses and she gets a choice: fix it, or restore the last good
  snapshot. Nothing is overwritten silently.
- The browser keeps not-yet-confirmed edits in IndexedDB and replays them
  after a reconnect. The dev runner restarts the server if it ever exits, and
  the job queue rebuilds itself from the cache.

**Performance budget** (Apple Silicon, measured in Phase 2 and Phase 10):
scrub to any frame < 50 ms; smooth 4K60 timelines via proxies (60 fps
playback of up to 3 video layers with color and transforms); timeline with
2,000 clips at 60 fps; 100-file import visible in < 3 s; proxies faster than
real time for 4K60 HEVC with VideoToolbox.

## 5. Schema v2 (outline; full reference goes in CLAUDE.md)

```jsonc
{
  "version": 2,
  "project": { "name": "Seoul vlog", "channel": "@blkgrlcotakesoff" },  // pulls brand presets
  "media": [ { "id": "m1", "file": "/Volumes/T7/…/DJI_…_D.MP4", "kind": "video",
               "duration": 12.5, "width": 3840, "height": 2160, "fps": 59.94,
               "codec": "hevc", "bitDepth": 10, "logProfile": "dlogm",   // auto for DJI, editable
               "rating": 0, "keywords": ["glasses"], "favorites": [ { "in": 2, "out": 6, "note": "" } ] } ],
  "bins": [ { "id": "b1", "name": "Day 1", "parent": null, "items": ["m1"] } ],
  "smartCollections": [ { "id": "s1", "name": "Unused 4K", "rules": [ … ] } ],
  "sequences": [ {
    "id": "seq1", "name": "Main", "width": 1920, "height": 1080, "fps": 59.94,
    "tracks": [ { "id": "v1", "kind": "video", "locked": false, "solo": false, "clips": [
      { "id": "c1", "media": "m1", "start": 0, "in": 2.5, "out": 8, "link": "L1",
        "speed": 1, "reverse": false, "enabled": true,
        "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1 },
        "crop": { "l": 0, "r": 0, "t": 0, "b": 0 },
        "color": { "input": "auto", "lut": "brand", "exposure": 0, "…": 0 },
        "effects": [ { "type": "vignette", "amount": { "keyframes": [[0, 0], [2, 0.4, "easeOut"]] } } ] } ] },
      { "id": "a1", "kind": "audio", "clips": [ { "id": "c2", "media": "m1", "link": "L1", "…": "…" } ] } ],
    "transitions": [ { "id": "x1", "between": ["c1", "c3"], "type": "crossDissolve", "duration": 0.5 } ],
    "markers": [ { "t": 5, "name": "chapter: Seoul", "color": "blue", "chapter": true } ],
    "captions": [ … ] } ],
  "mainSequence": "seq1"
}
```

- **Linked clips:** a video clip's sound is its own clip on an audio track,
  linked by `link`. They move together unless unlinked or Option-dragged,
  which is how J and L cuts work.
- **Nested sequences:** a clip can be `{ "sequence": "seq2", … }`.
- **Keyframes:** any number becomes `{ "keyframes": [[t, value, ease?], …] }`.
- **v1 files are migrated automatically** (with a snapshot taken first).

## 6. Features by area

### Editing (Premiere-style)
- Multi-track timeline: video, audio, title/caption tracks; track lock, solo,
  mute, hide, height, colour labels, targeting (V1/A1 patches).
- **Source monitor** (open a clip, mark I/O, play J/K/L) and **Program
  monitor**; timecode display; match frame (F); safe-area and aspect guides
  (9:16 social UI overlays).
- Edits: **insert (,)**, **overwrite (.)**, three-point editing, replace,
  append, lift (;), extract ('), ripple delete (⇧⌫), gap close.
- Trims: **ripple (B), roll (N), slip (Y), slide (U)**, trim to playhead
  (Q/W), extend edit (E), numeric nudge (⌥←/→), trim mode with live two-up
  frames.
- **Blade (C)** and add edit at playhead (⌘K) across targeted tracks.
- **Snapping (S)** to clips, playhead, markers, beat markers.
- **Markers (M)**: sequence and clip markers, colours, notes, chapters,
  marker list panel.
- **Linked selection**, unlink, **J/L cuts** with Option-drag.
- **Nested sequences / compound clips**, open in a tab, edit in place.
- Clip enable/disable, colour labels, paste attributes, duplicate sequence.
- **Keyboard:** J/K/L shuttle (repeat to speed up, K+J/L to inch), I/O, X
  (mark clip), ⇧I/⇧O (go to in/out), ↑/↓ (previous/next edit), +/− zoom,
  ⇧Z (zoom to fit), Space play. Premiere defaults; editable keymap file.
- **Multicam** (Phase 6): sync angles by audio, switch angles live while
  playing.

### Media
- Bins (nested folders), list and thumbnail views, sortable metadata columns
  (resolution, fps, codec, bit depth, log profile, duration, size, date,
  camera).
- Search across names, keywords, notes and (after Phase 7) **what's said in
  the clip** (transcript search: "where do I say 'good morning'").
- Favorites as ranges (FCP-style), 1–5 ratings, rejects, keywords.
- **Smart collections**: saved rules (e.g. "4K, unused, rated 4+",
  "vertical", "has speech", "DJI").
- Used/unused indicators, hover-scrub filmstrips, reveal in Finder, relink
  manager, offline report, project archive (copy the used media and project
  to a folder; only when she asks).

### Video
- **Transform**: position, scale, rotation, anchor, opacity, flip; on-screen
  handles in the Program monitor.
- **Crop** with handles; Ken Burns (keyframed scale/position).
- **Keyframes** for every number, with easing curves; keyframe lanes on
  clips.
- **Speed**: constant %, **speed ramps** (time-remap keyframes), **reverse**,
  **freeze frame** (⇧F), optical-flow slow motion (export).
- **Stabilisation** (ffmpeg vid.stab: background analysis pass, smoothing
  amount, crop).
- **Auto-reframe** 16:9 → 9:16 following her face (Phase 8).
- Background **render cache** for heavy sections, with a render bar on the
  timeline (red / yellow / green, as in Premiere).

### Color
- **Input transform per clip.** **D-Log M → Rec.709** with DJI's own LUT
  (`brand-bible/brands/assets/luts/dji-pocket3/`). It's applied automatically
  to DJI Pocket 3 footage, because DJI mis-tags D-Log M as bt709 so the file's
  color tag can't be trusted. A per-clip switch overrides it either way, using
  the same rule as BLKGRLCO Bin. iPhone HLG/HDR gets tone mapping to Rec.709.
- **Creative LUT** per clip or per sequence: default from the channel (The
  Everyday LUT for @blkgrlco and @blkgrlcotakesoff), intensity slider, her LUT
  library.
- **Order** follows the brand bible: base correction → conversion → creative
  LUT → finishing (black levels last).
- Basic correction: exposure, contrast, highlights, shadows, whites, blacks,
  temperature, tint, saturation, vibrance. Lift/gamma/gain wheels, curves
  (RGB and hue-vs-sat), copy/paste grade, before/after split view.
- **Scopes** on the GPU: waveform, RGB parade, vectorscope with skin-tone
  line, histogram. Skin tones stay natural (brand rule), and the vectorscope's
  skin line helps check it.

### Audio
- Mixer with track faders, pan, mute/solo and **LUFS + peak meters**.
- Clip gain, **volume keyframes** (rubber band), fades, automatic
  **crossfades** on audio cuts.
- **Noise reduction** (`afftdn`, RNNoise `arnndn`), EQ, compressor,
  **de-esser**, limiter.
- **Ducking**: music dips under speech automatically (sidechain), or
  de-esser-style ducking per the brand's Cut Theory rule.
- **Loudness normalisation** to a target: −14 LUFS for YouTube and social,
  −16 LUFS for the podcast (locked rule), two-pass `loudnorm` on export.
- **Sync external audio** to camera audio by waveform; beat markers on music.

### Titles, graphics, captions
- Title tool on the canvas; **templates**: lower thirds, title cards, end
  cards, **BLKGRLCO label cards** (Arial Rounded Bold, `#A8B118`, lowercase),
  brand fonts (Advercase, Editor's Note, TAN Memories, Perfectly Nineties)
  and palettes as swatches. Animations: fade, slide, pop, typewriter.
- Shapes, images and logos as graphics clips.
- **Auto-captions with Whisper** (whisper.cpp, on the Mac): word-level
  timing, editable caption track, styles (burned-in social style with
  word highlight, or clean), line length rules, **SRT/VTT export**, burn-in.
  Her words only: captions are never reworded (podcast rule R6).
- **Transcript panel**: read the clip as text, select words to make a cut,
  search what was said.

### Transitions and effects library
- Transitions: cross dissolve, dip to black/white, wipes, slide, push, zoom,
  blur, and more (GPU shaders in preview, ffmpeg `xfade` in export).
- Effects: blur, sharpen, vignette, film grain, glow, mirror, chroma key
  (green screen), shape masks with feathering, picture-in-picture, drop
  shadow, letterbox, **adjustment layers** (effects over everything below).
- Library panel with search, favourites and drag-onto-clip; effect presets.

### AI helpers (run by Claude in the session, using the app's tools)
- **Remove silences**: find pauses (silence detection + transcript),
  propose cuts, keep pauses that carry feeling (documentarian rule),
  explainer mode cuts them all.
- **Flub takes**: find her "lululu" / "la la la" marker and repeated lines,
  keep the last clean take.
- **Best takes**: group repeated lines, rank by delivery (no stumbles,
  steady level), show a choice.
- **Cut on the beat**: detect beats in the chosen track, snap cuts and
  b-roll to them.
- **Rough cut from notes or a script**: match her notes/script to the
  transcripts and lay out a first assembly.
- **Shorts from a long-form**: find moments, reframe to 9:16, add captions.
- **Chapters**, a **QC pass** against her brand rules (the quality-control
  agent), and b-roll gap suggestions.
- Every AI change lands as normal, undoable edits marked "Claude" in
  Activity, so she can review and reverse any of it.

### Export
- Presets: **YouTube 4K and 1080p** (H.264/HEVC, −14 LUFS), **Instagram /
  TikTok vertical 1080×1920**, **4K master (ProRes 422 HQ via
  VideoToolbox)**, audio-only (podcast −16 LUFS), stills, GIF.
- **Render queue** (Resolve-style): several jobs, background, progress,
  cancel, retry, notifications; export a range or a marked section.
- Sidecars: SRT/VTT captions, YouTube chapters text, thumbnail stills.
- Preflight before export: offline media, loudness, retired names in
  titles, missing fonts.

### Performance
- Proxies by default with Proxy/Full toggle (done); WebCodecs + WebGL2
  for decode and compositing; filmstrip and waveform tiles; prefetching
  around the playhead; background render cache for heavy effects; job
  priorities so playback never waits on background work; hardware decode and
  encode with VideoToolbox in every job that can use it.

### Also expected by professionals (added)
- Project manager (several projects, one folder each), project templates per
  channel, sequence presets.
- Timecode everywhere, mixed frame rates conformed per sequence.
- Gap and flash-frame detection, timeline index, find clip in timeline.
- Still-frame export, "send to" the BLKGRLCO agents (packaging, QC).
- Preferences (cache location and size limit, job count, keymap), cache
  cleaner, crash log viewer, onboarding tips.

## 7. Phases

Each phase ends with tests run here, a "how to try it" note for her, and a
stop for her feedback.

| Phase | What she gets | Tested here by |
|---|---|---|
| **1. Foundation 2.0 + D-Log M** | Schema v2 with migration from v1; linked video/audio clips; **undo/redo for both of us** (⌘Z, Activity "undo this", `tl undo`); autosave snapshots, named versions, crash recovery; `tl` CLI for Claude; **D-Log M → Rec.709 automatically on DJI clips** (in proxies, so preview looks right, and in export) plus the channel's creative LUT in export; channel presets from the brand bible | Unit tests (patches, undo across authors, migration, recovery from a corrupt file), export frames vs reference colors, Playwright for undo |
| **2. Pro editing core** | Canvas timeline; Source + Program monitors; J/K/L, I/O, insert/overwrite, three-point edits; ripple/roll/slip/slide, blade, lift/extract, ripple delete; snapping, markers, J/L cuts, track lock/solo/targeting; nested sequences; keymap; WebGL2 + WebCodecs viewer with frame-accurate scrubbing | Model tests for every edit and trim (including edge cases), Playwright keyboard flows, scrub latency benchmark |
| **3. Media management** | Bins, list/grid, metadata columns, search, favorites ranges, ratings, keywords, smart collections, filmstrip hover-scrub, used/unused, relink manager, project manager | Unit tests for collection rules, Playwright for bin flows, import of 500 files |
| **4. Video + effects** | Transform/crop with on-screen handles, keyframes with easing, speed/ramps/reverse/freeze, stabilisation, transitions and effects library, adjustment layers, background render cache and render bar | Golden-frame tests (preview vs export) for every effect and transition |
| **5. Color** | Color panel: basic correction, wheels, curves, LUT browser and intensity, the full pipeline in the GPU preview (creative LUT included), scopes, HLG tone mapping, copy/paste grade, before/after | Golden frames with her actual LUT files; scope readings on test patterns |
| **6. Audio** | Mixer, meters (LUFS), clip/track keyframes, crossfades, noise reduction, EQ, compressor, de-esser, ducking, loudness normalisation, external-audio sync, multicam | Loudness of exports within ±0.5 LU of target; sync offset tests with shifted copies |
| **7. Titles, graphics, captions** | Title templates (lower thirds, label cards, brand fonts), animations, shapes/images, safe areas; Whisper captions, caption editor and styles, SRT/VTT, burn-in; transcript panel and transcript search | Caption timing vs a known script, title preview vs export golden frames |
| **8. AI helpers** | Remove silences, flub takes, best takes, cut on the beat, rough cut from notes, auto-reframe to 9:16, shorts finder, chapters, brand QC | Fixtures with known silences, beats and repeated takes; every helper's edits are undoable |
| **9. Export and delivery** | Preset library, render queue, range export, ProRes master, sidecars (SRT, chapters), preflight checks | Each preset's output checked with ffprobe and loudness measurement |
| **10. Mac app + polish** | Electron app (Dock icon, native menus, real drag-and-drop paths, starts the server), performance tuning against the budget, preferences, cache manager, onboarding | Packaged build smoke test; she runs the 4K60 benchmark on her Mac |

**Why this order:** Phase 1 makes everything after it safe: undo, recovery
and linked clips change the schema, so they come before features pile onto
it. D-Log M is in Phase 1 because her footage looks wrong without it. Phase 2
is what makes it feel like a real editor day to day. Color, audio and
captions then each stand alone. AI helpers come after transcripts and beats
exist. Packaging comes last, when the app is worth installing.

## 8. Risks and honest limits

- **Testing on her Mac.** This cloud session runs Linux: no VideoToolbox, no
  Metal, no Mac Electron build. Everything is tested here with software
  fallbacks; Mac-only paths (hardware encode, whisper.cpp Metal, the Electron
  app) need her to run a short check each phase. Each phase's notes say
  exactly what to try.
- **Preview vs export parity.** Two renderers can drift. Golden-frame tests
  catch it; where an effect can't match exactly (optical-flow slow motion,
  stabilisation before analysis finishes), the preview says so.
- **Browser limits.** Chrome (or the Electron app) is required for WebCodecs.
  Safari isn't supported until Phase 10's app makes it moot.
- **Whisper model download** (~1.6 GB for large-v3-turbo) happens once, on
  her Mac, when she first asks for captions.
- **Stabilisation and optical flow are slow** (CPU in ffmpeg). They run in the
  background and are cached.
- **Size.** This is many weeks of work across sessions. Each phase is built,
  tested and committed on its own, so the app is never left half-working.
- **Repo is public.** Media, caches, exports and `project/` stay gitignored;
  only code and docs are committed.
