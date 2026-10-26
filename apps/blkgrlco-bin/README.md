# BLKGRLCO Bin

A local web app for organizing footage and planning videos. It runs on your Mac at
`http://localhost:4321` and works directly on the T7 (`Untitled/project hhh/<video>`).

**Status:** Phase 1 (Media) and Phase 2 (Plan) built. Phase 3 (Overview) is next.

## Start it

1. Install ffmpeg and Python 3.10+ once: `brew install ffmpeg python@3.12`
2. Double-click **`Start BLKGRLCO Bin.command`**. The first run installs the Claude SDK and
   local Whisper, which takes a few minutes. After that it opens your browser.
3. Add your Anthropic API key in **Settings → Connections**. It's saved to
   `~/Library/Application Support/BLKGRLCO Bin/.env` and never goes into this repo or onto the T7.
4. Click **Pick folder** and choose one video's subfolder (not the whole `project hhh`).

If macOS blocks the `.command` file the first time, right-click it → Open.

## What the Media tab does

| Step | What happens |
|---|---|
| Pick folder | The native macOS folder dialog. Every video, audio and photo file becomes a card. macOS `._` junk files are ignored. |
| Analyze all | ffprobe reads the file details. ffmpeg pulls 3 frames (audio files get a waveform). Local Whisper measures speech (none / some / lots). Claude looks at the frames and facts, then writes a description, a title and a category. |
| Cards | 2 thumbnails, type, duration, size, device, speech level, old name → proposed name (✎ edits the title part), status, category dropdown, re-analyze, and an include box. |
| Submit changes (N) | A dry run first: every rename and move is listed. Nothing changes until you click Apply. |
| Apply | Renames files, moves them into category folders, appends to `_bin-log.csv`, and writes `_footage-master.md`. |
| Undo last submit | Moves every file back and removes the folders that submit created, if they're empty. The undo is logged too. |

Safety rules, enforced in `blkbin/submit.py` and covered by tests:
- Nothing is ever deleted. Older versions of `_footage-master.md` go to `.blkgrlco-bin/history/`.
- Nothing is ever overwritten. A name that's taken gets `-2`, `-3`, and so on, checked again right before each move.
- Moves only happen inside the project folder on one drive (a rename, never copy-then-delete).
- Apply refuses to run if anything changed since the dry run you looked at.
- The app won't open a whole drive, your home folder, or the whole `project hhh` folder.

## What the Plan tab does (one plan per video)

| Sub-tab | What it holds |
|---|---|
| Video details | Working name, post date, channel (@blkgrlco, @blkgrlcotoo, podcast), video type, status (Not started / In progress / Posted). |
| Titles | Type or paste titles, one per line. Ticking one sends it to the dashboard. Long-forms show a warning until they have 3 titles. |
| Thumbnails | Drop 3 PNGs. Each gets a click-appeal score (0–100), ranked, with notes: timestamp corner covered, cluttered at phone size, over 5 words or too small to read, fails the red-green colorblind preview (toggle to see it), face not centered. Link each one to a title. |
| Script & music | Type `@` where a song starts and pick from this project's Music files. The cue list shows every song in order, with its line. |

**How the score works.** Claude rates the thumbnail's appeal (0–100) and reads its text
and face position. Each failed check then takes points off: corner −15, clutter −15,
words −10, readability −10, colorblind −10, face −10. The corner, clutter and colorblind
checks run on your Mac without Claude. The score ranks your options against each other;
it doesn't predict click-through.

## How the dashboard is connected

Every time you tick a title or change a video's details, Bin rewrites
`~/BLKGRLCO Studios/bin-export.json` (you can change the location in Settings → Connections).
On the BLKGRLCO Studios dashboard (claude.ai), open **Data → Imports & Code → Import from
BLKGRLCO Bin** and choose that file. You get a preview first. Then:
- a video the dashboard doesn't have yet becomes a new record (at Idea, or Story map if it's in progress);
- an existing record (matched by Bin's id, then the T7 folder, then the name) only gets *empty* fields filled
  (post date, raw folder) and ticked titles added into empty title slots;
- nothing is removed, and nothing is moved to Posted. That still needs your go on the dashboard.

A claude.ai page can't read files on your Mac by itself, so choosing the file is the one manual step.

## Where things are kept

Plans (titles, thumbnails, script) are kept on your Mac in
`~/Library/Application Support/BLKGRLCO Bin/projects/`. Each T7 folder holds a small
`.blkgrlco-bin/project.json` so the app knows which plan belongs to it.
Analysis data (frames, Whisper output, Claude's notes, undo journals) is kept in a hidden
`.blkgrlco-bin/` folder inside each project, so it travels with the T7.

## Tests

- `python3 -m unittest discover -s tests` runs the unit tests on synthetic footage in a temp
  folder: naming, collisions, dry run, submit, undo, and the security checks.
- **`run-tests.command`** runs the real-footage test on your Mac:
  - **Option 1:** copies one T7 folder to `~/bin-test`, analyzes it, submits, undoes, and proves
    the copy is identical to before (path, size, SHA-256 and modified time). It also proves the
    T7 original was never touched. It writes a report and a labels template for your 30 hand labels.
  - **Option 2:** scores your labels against the app's categories.
  - **Option 3:** scores your past thumbnail A/B tests. Put each test in its own folder in
    `~/bin-test/ab/` (the thumbnails plus a `winner.txt` with the winning file's name). The
    report says whether the app's #1 matches the real winner for each test.

## Layout

```
blkbin/        Python server (standard library HTTP server) and logic
  media.py     scanning, ffprobe, device and date detection
  frames.py    ffmpeg frame and waveform extraction
  speech.py    Whisper speech level (with an audio-energy fallback)
  vision.py    Claude description, title and category (with a rules fallback)
  naming.py    proposed names
  project.py   per-project state and the analysis queue
  submit.py    dry run, apply, undo, _bin-log.csv, _footage-master.md
  registry.py  every video's plan + the dashboard export
  planning.py  thumbnails, title links, script & music cues
  thumbs.py    thumbnail checks and the click-appeal score
  server.py    API + static files, bound to 127.0.0.1 only
  cli.py       command-line tools used by run-tests.command
web/           the interface (HTML/CSS/JS, no build step)
tests/         unit tests + synthetic footage generator
```
