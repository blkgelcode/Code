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

1. Put clips (video, audio, images) in `apps/timeline-editor/media/`.
2. Press **Import**. Each file gets a thumbnail, a duration and a 720p preview
   copy (the preview copies take a little while for long 4K clips).
3. Drag files from the Media panel onto a track, or double-click to add them at
   the end.
4. Edit:
   - **Drag** a clip to move it, including onto another track of the same kind.
   - **Drag its edges** to trim.
   - **S** splits at the playhead, **Delete** removes the selected clip, **T** adds a title.
   - **Space** plays; **←/→** step a frame (**⇧** for a second); **⌘/Ctrl + scroll** zooms.
5. **Export MP4** renders from your original files into `project/exports/`.

To work straight from the T7 without copying files:

```bash
MEDIA_DIR="/Volumes/T7/project hhh/my-video" PROJECT_DIR="/Volumes/T7/project hhh/my-video/_edit" npm run dev
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
- No undo yet: the activity log shows every change, and Claude can reverse one
  if you ask.
- D-Log M footage previews and exports flat: the conversion LUT and The
  Everyday LUT aren't applied in this app yet.
- No speed changes, keyframes or transitions other than fades.
