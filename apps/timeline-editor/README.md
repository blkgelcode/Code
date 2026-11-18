# Timeline Editor

A local multi-track video editor that you and Claude Code edit together, live.
The whole edit is one file, `project/timeline.json`. Drag a clip in the browser
and the file changes; ask Claude to "cut the first 3 seconds of clip 2" and the
browser updates while you watch. The Activity panel shows who changed what.

## Run it (Mac)

You need [Node.js](https://nodejs.org) 18+ and ffmpeg (`brew install ffmpeg`).

```bash
cd apps/timeline-editor
npm install          # first time only
npm run dev          # then open http://localhost:5173
```

1. **Bring in footage, from anywhere, without copying it:**
   - **Import…** opens a window that browses your Mac and your drives
     (**⏏ T7** under `/Volumes`). Tick files, or press **Import whole folder**.
     You can also paste a path (in Finder, **⌥⌘C** copies one).
   - **Drag files or folders** from Finder onto the app. The browser only tells
     the app each file's name and size; the app finds it on disk and reads it
     there. If it can't find one, it says so: use Import… for that one.
2. Clips show up in the bin at once with their resolution, frame rate, codec
   and length. A background queue (2 jobs at a time, so the Mac stays
   responsive) then makes a thumbnail, an audio waveform and a 960×540 proxy
   for each one, with a progress bar per clip. On a Mac it uses hardware
   (VideoToolbox), so 4K HEVC 10-bit footage converts quickly.
3. As soon as a clip says **Ready**, drag it onto a track or double-click it.
4. Edit:
   - **Drag** a clip to move it, including onto another track of the same kind.
   - **Drag its edges** to trim.
   - **S** splits at the playhead, **Delete** removes the selected clip, **T** adds a title.
   - **Space** plays; **←/→** step a frame (**⇧** for a second); **⌘/Ctrl + scroll** zooms.
5. **Export MP4** renders from your original 4K files at full quality into
   `project/exports/`, with hardware encoding on a Mac.

**Proxy / Full quality** (top right) switches the preview between the small
proxies (smooth) and the original files (sharp; HEVC 10-bit originals often
won't play in a browser, which is what the proxies are for). Video is streamed
to the player in small ranges, never loaded whole.

**Drives:** unplug the T7 and its clips turn grey with **OFFLINE**. You can
keep editing them with their proxies; export waits until the drive is back.
Plug it in and they reconnect by themselves, even if macOS mounts it as
"T7 1". Proxies are cached in `project/.cache/`, so nothing is ever converted
twice.

To keep a project's timeline and cache somewhere else (e.g. one per video):

```bash
PROJECT_DIR="$HOME/Movies/edits/my-video" npm run dev
```

## Editing with Claude Code

Open Claude Code in this repo with the app running and ask for edits in plain
words: "move clip 4 to 0:20", "add a title 'good morning' at 0:05", "make the
music quieter", "export it". Clip ids (`c1`, `c2`…) are printed on every clip.
Claude follows `CLAUDE.md` in this folder, which documents the file format.

Who changed what is kept in `project/activity.jsonl`, so Claude can also see
what you did.

## Limits (v1)

- The browser preview stacks the clips live and is close to, not identical
  with, the export. Export is the source of truth.
- HDR (iPhone HLG) and D-Log M footage look flat in proxies and exports: no
  tone mapping or LUTs yet.
- Drag-and-drop finds files by name and size. On a huge drive that Spotlight
  doesn't index, the search can time out; Import… always works.
- No undo yet: the activity log shows every change, and Claude can reverse one
  if you ask.
- No speed changes, keyframes or transitions other than fades.
