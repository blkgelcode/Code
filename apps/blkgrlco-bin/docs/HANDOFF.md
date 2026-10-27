# BLKGRLCO Bin: handoff for a Claude Code session on Omnia's Mac

Read this whole file before doing anything. It's everything the cloud session that built the app
knows. The cloud session couldn't reach the Mac or the T7, so **every real-footage test is still
waiting to be run, and that's the first job here.**

Repo: `blkgelcode/code` · branch `claude/social-media-brand-agent-6qsz3f` · app folder `apps/blkgrlco-bin/`
Owner: Omnia (BLKGRLCO Studios). Read `apps/blkgrlco-bin/README.md` too: it's the user-facing guide.

---

## 1. How Omnia works (follow these)

- **Plan before code.** For new work, give a short plan (stack, files, what you can't do) and wait for her yes.
- **Build in phases and show each one working before starting the next.** Screenshots or pasted output, not claims.
- **Tabs everywhere, no long scrolling pages.** Font: Poppins. Palette only:
  `#F0DAC2 #B68A71 #B4AD7F #636407 #A8B118 #EBB9BA #8C0532 #49001B #2E1500`.
- **No Notion.** Ideas and approved titles go to her BLKGRLCO Studios dashboard (claude.ai artifact
  https://claude.ai/artifact/UZu9ZMKxs7FyTR9UMHxBKn) through a JSON export.
- **Never test on the T7 originals.** Copy one folder to `~/bin-test` and test there.
- **Never delete footage. Never overwrite a file**: a taken name gets `-2`, `-3`, …
- Plain, direct language. Report failures with the real output. Don't claim something works until it's been run.
- Commit to the branch above. End commit messages with the attribution lines your environment asks for.

## 2. What the app is

A local web app at `http://localhost:4321` (Python standard-library server, vanilla HTML/CSS/JS, no build step).
It works directly on the Samsung T7, which mounts as **`/Volumes/Untitled`**; footage lives in
`/Volumes/Untitled/project hhh/<one folder per video>`.

Cameras: DJI Osmo Pocket 3 (`DJI_YYYYMMDDHHMMSS_####_D.MP4`, D-Log M, usually vertical) and iPhone (`IMG_####.MOV`; some horizontal).
Channels: @blkgrlco (main), @blkgrlcotoo (travel), podcast "I Wish Someone Had Told Me" (handle @iwishsomeonetoldme).

### Built and committed

| Phase | Tab | Status |
|---|---|---|
| 1 | **Media**: folder picker, file cards (2 thumbnails, type, duration, size, device, speech none/some/lots via local Whisper, old → new name, status Waiting → Analyzing → Included → Saved, category dropdown, re-analyze), Analyze all (ffprobe + 3 ffmpeg frames + Claude vision), filter chips + Video/Audio/Photos toggle, Submit changes = dry run then apply (rename + move into category folders, `_bin-log.csv`, `_footage-master.md`), Undo last submit, categories editable in Settings | Built. **Real-footage tests not run yet.** |
| 2 | **Plan**: video details, title ideas (tick → dashboard export, long-forms need 3), thumbnails (0–100 click-appeal score + checks + colorblind toggle + link to title), script editor with `@` song tags from the project's Music files | Built. **A/B check not run yet.** |
| 3 | **Overview** + project **sidebar**: YouTube Analytics (OAuth, 7/28-day, views, net subs, watch hours, earnings if available), ideas box (typed/pasted/screenshot → projects under Not started), sidebar grouped In progress / Not started / Posted, sortable by type | Built. **Not connected to real YouTube yet.** |
| 4 | Add-ons (spec in §6) | **Not built.** Starts only after Phases 1–3 are signed off. |
| 5 | Strategy tab | **Not built.** Spec + feasibility notes in `docs/PHASE5_STRATEGY_SPEC.md`. Only after 1–4 are signed off. |

40 unit tests pass in the cloud: `cd apps/blkgrlco-bin && python3 -m unittest discover -s tests`.

### Things that were never exercised for real (the cloud had no network access to them)

- **Claude calls** (`blkbin/vision.py`): clip classification, thumbnail reading, screenshot → ideas. They use the
  official `anthropic` SDK, `client.beta.messages.create(..., betas=["server-side-fallback-2026-07-01"], fallbacks="default",
  output_config={"effort": ..., "format": {"type": "json_schema", ...}})`, model from Settings (default `claude-opus-5-5`).
  If the installed SDK rejects any of those arguments, fix it against the SDK docs, then re-run.
- **faster-whisper** (`blkbin/speech.py`): only the audio-energy fallback ran in the cloud. Check the real Whisper path on the Mac.
- **The native folder picker** (AppleScript `choose folder`), **Poppins** (loaded from Google Fonts), and the `.command` launchers.
- **Google OAuth + YouTube Analytics** (`blkbin/youtube.py`): tested only against a fake Google.

## 3. Setup on the Mac

```bash
brew install ffmpeg python@3.12
git clone -b claude/social-media-brand-agent-6qsz3f https://github.com/blkgelcode/code.git ~/blkgrlco-code
cd ~/blkgrlco-code/apps/blkgrlco-bin
```
Then double-click **`Start BLKGRLCO Bin.command`** (or run it in Terminal). The first run makes a venv in
`~/Library/Application Support/BLKGRLCO Bin/venv`, installs `requirements.txt`, and opens the browser.
Omnia adds her Anthropic API key in **Settings → Connections**. It's stored in
`~/Library/Application Support/BLKGRLCO Bin/.env`. **Never commit keys or tokens; the repo is public.**

## 4. First jobs for you, in order

### 4a. Phase 1 test (Omnia chose "Option 1")
Run `run-tests.command`, choose **1**, and give it ONE folder from `/Volumes/Untitled/project hhh`. It:
copies the folder to `~/bin-test/<name>` (never touching the T7) → runs the unit tests → analyzes →
snapshots → submits → undoes → snapshots → proves before == after-undo (path, size, SHA-256, mtime)
→ proves the T7 original is unchanged → writes `~/bin-test/labels-<name>.csv`.
Show Omnia the report (`~/bin-test/report-*.txt`), especially the two `IDENTICAL` lines and any errors.
Also open the copy in the app UI and show her the Media tab with real cards.

**The 30-clip label check** (needed before Phase 1 counts as done): Omnia fills `your_category` for 30
clips in the labels CSV, then `run-tests.command` → **2**. Target: **at least 27 of 30**. If it's lower,
tune the category hints (Settings → Categories, which Claude reads), the speech thresholds, or the prompt
in `vision.py`, then re-score, and report both results honestly.

### 4b. Phase 2: thumbnail A/B check (Omnia said yes)
Have Omnia put each past A/B test in `~/bin-test/ab/<test name>/` (the thumbnails + `winner.txt` holding
the winning file's name). Run `run-tests.command` → **3**. Report, per test, whether the app's #1 matched the
real winner, and the total. It's a rule-based score (Claude's appeal rating minus a penalty for each failed check:
corner −15, clutter −15, words −10, readability −10, colorblind −10, face −10), not a click-rate predictor. Say so.

### 4c. Phase 3: connect YouTube (Omnia said yes)
Walk her through **Settings → Connections → YouTube Analytics** (the steps are in the app):
1. console.cloud.google.com → new project "BLKGRLCO Bin" → enable **YouTube Data API v3** and **YouTube Analytics API**.
2. OAuth consent screen → External → add her email as a test user → set **Publishing status: In production**
   (in Testing, Google expires refresh tokens after 7 days). Google shows an "unverified app" warning;
   that's expected: Advanced → Go to BLKGRLCO Bin.
3. Credentials → OAuth client ID → **Desktop app** → download the JSON → choose it in the app.
4. **Connect a channel**, once each for @blkgrlco, @blkgrlcotoo and the podcast (Google asks which channel).
   Redirect is `http://127.0.0.1:4321/oauth/callback` (desktop loopback; no need to register it).
5. Overview → Channels: check the 28-day views against YouTube Studio (the app's range ends 3 days ago,
   because Analytics lags). Earnings show "not available" unless the channel is in the Partner Program.
Tokens live in `~/Library/Application Support/BLKGRLCO Bin/youtube/` (mode 600).

## 5. The dashboard connection (already live)

- Bin rewrites `~/BLKGRLCO Studios/bin-export.json` whenever a title is ticked or details change
  (location editable in Settings → Connections). Folders under `~/bin-test` are left out of it on purpose.
- The dashboard (version 10) has **Data → Imports & Code → Import from BLKGRLCO Bin**: choose the file → preview →
  Apply. New videos become records (stage Idea, or Story map if in progress). Existing records (matched by
  `bin.id`, then raw folder, then name) only get *empty* fields filled and ticked titles added into empty title slots.
  Nothing is removed. **Never set stage to Posted: the dashboard requires Omnia's go.**
- The dashboard's record fields are documented on its own Data → Imports & Code page ("For Code: reading a record").

## 6. Phase 4 spec (Omnia's words; build only after Phases 1–3 are signed off)

1. **INGEST:** detect when a DJI or iPhone card/folder is connected. Copy everything to the T7 under
   `project hhh/<new project>/_raw` and check each copy with a checksum. Show "safe to wipe card" only when every
   file matches. Never delete anything from the card.
2. **FIX + PROXY:** if a file fails ffprobe or won't decode, re-encode it to a clean H.264 MP4 next to the original
   (name ends in `_fixed`), keeping the original. Make 720p proxies in `_proxies`.
3. **LUT FIRST:** apply "DJI OSMO Pocket 3 D-Log M to Rec.709" to every frame pulled from DJI clips BEFORE Claude
   analyzes it: card thumbnails, categories and thumbnail picks. Never change the original files.
   ⚠ That .cube file is **not in the repo** (`brand-bible/brands/assets/luts/` only has the creative LUTs). Ask Omnia for it.
   DJI mis-tags D-Log M as bt709, so don't trust the file's own color tag.
4. **FLUB + SILENCE MAP:** transcribe every clip with speech. Mark by timestamp: her "lululu" / "la la la" flub marker,
   any silence over 0.7s, and repeated takes of the same line ranked by best delivery. Write it all into
   `_footage-master.md`. (Whisper often drops nonsense syllables: combine word gaps with an `initial_prompt` hint,
   and check the result against what she actually said.)
5. **RETENTION LOOP:** 48h and 7 days after a video posts, pull its audience retention curve from the YouTube
   Analytics API. Match each drop of 5% or more to the clip playing at that timestamp (use `_footage-master.md` + the
   edit's clip order). Keep a running "what loses viewers" table by clip category in Overview.
   (CapCut doesn't export a clip list cleanly: plan a drag-to-order list in the Plan tab. Retention comes in steps of
   1% of the video length. Scheduled pulls only run while the Mac is on, so catch up on start.)

**Phase 4 testing:** run all 5 on `~/bin-test` and show Omnia the checksum report, one before/after LUT frame, and
the flub map for one talking-head clip checked against what she actually said.

## 7. Phase 5

See `docs/PHASE5_STRATEGY_SPEC.md`. Open questions there: where her **Nia / Zara / Amara** audience profiles are saved,
and where her **Oct 21 outlier-study hook/title rules** live. Neither is in the repo.

## 8. Code map and conventions

```
blkbin/  settings.py  app settings + API key (.env in ~/Library/Application Support/BLKGRLCO Bin)
         media.py     scan (skips ._ files), fingerprint ids, ffprobe, device/date/orientation
         frames.py    3 frames per video (15/50/85%), waveform for audio, photo preview
         speech.py    faster-whisper speech level; energy fallback
         vision.py    Claude: classify clips, read thumbnails, read idea screenshots (rules fallback)
         naming.py    proposed names (default {date}_{category}-{title}.ext)
         project.py   per-folder state in <folder>/.blkgrlco-bin/, analysis queue (2 workers)
         submit.py    dry run / apply / undo with write-ahead journals, _bin-log.csv, _footage-master.md
         registry.py  plans (~/Library/Application Support/BLKGRLCO Bin/projects/<id>/plan.json), ideas, export
         planning.py  thumbnails, title links, script cues      thumbs.py  thumbnail checks + score
         youtube.py   desktop OAuth (PKCE, loopback) + Analytics  server.py  routes; 127.0.0.1 only; POSTs need X-Bin: 1
         cli.py       copy / analyze / plan / apply / undo / snapshot / compare / labels-template / accuracy / score-ab
web/     index.html app.js (media, settings) plan.js overview.js styles.css
tests/   test_bin.py test_plan.py test_overview.py + make_fixtures.py / make_thumbs.py (synthetic footage)
```
Safety rules are enforced in `submit.py` and covered by tests. Keep them: never delete; check names case-insensitively;
re-check right before each rename; `os.rename` only (no copy+delete); refuse an apply if the dry run is stale.
Add a test for every fix, and drive at least one test through the HTTP server: a route bug once hid behind direct-call tests.
