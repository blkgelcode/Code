# BLKGRLCO Bin

A local web app for organizing footage and planning videos. It runs on your Mac at
`http://localhost:4321` and works directly on the T7 (`Untitled/project hhh/<video>`).

**Status:** all five phases built: Media, Plan, Overview, the Phase 4 add-ons and the Strategy tab.
Real-footage, real-YouTube and real-Claude tests still have to run on the Mac (`run-tests.command`, options 1–5).

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

## What the Overview tab and the sidebar do

| Part | What it does |
|---|---|
| Sidebar (every tab) | Your projects grouped In progress / Not started / Posted, sortable by type, post date or name. Click one to open its plan, and its footage if its T7 folder is plugged in. ☰ hides it. |
| Overview → Channels | Per channel: views, net subscribers (plus the current total), watch hours, and earnings if the channel has them. 7-day / 28-day toggle, each with a trend line and the change vs the period before. Click a tile to chart it per day; hover for each day's value; "Show as table" for the numbers. YouTube Analytics runs about 3 days behind, so the range ends 3 days ago. |
| Overview → Ideas | Type or paste ideas one per line, or drop a screenshot of a list (Claude copies the items into the box so you can check them first). Each idea becomes a project under Not started and goes to the dashboard file. Duplicates are skipped. |
| Ideas without footage | Click one and the Media tab offers "Link a folder…" once you've filmed it. A folder that already belongs to another video is refused. |

### Connecting YouTube (one time, about 10 minutes)

Settings → Connections walks through it:
1. console.cloud.google.com → new project → turn on **YouTube Data API v3** and **YouTube Analytics API**.
2. OAuth consent screen: External, add yourself as a test user, then set **Publishing status: In production**.
   In "Testing" status Google expires the sign-in every 7 days. Google shows an "unverified app"
   warning for a personal app; choose Advanced → Go to BLKGRLCO Bin.
3. Credentials → OAuth client ID → **Desktop app** → download the JSON → choose it in Settings.
4. Click **Connect a channel** once per channel (@blkgrlco, @blkgrlcotoo, the podcast). Google asks which channel.

The app asks for read-only YouTube and Analytics access, plus the earnings report (it shows
"not available" for a channel outside the Partner Program). Sign-in tokens stay in
`~/Library/Application Support/BLKGRLCO Bin/youtube/`, readable only by you. Results are cached for an hour.

## Phase 4 add-ons

| Add-on | Where | What it does |
|---|---|---|
| Ingest | **Ingest** button (top bar). A pink "📷 DJI card" button appears by itself when a card is plugged in. | Copies everything from the card (or a folder of iPhone footage) into `project hhh/<new project>/_raw` on the T7, then reads every copy back and compares SHA-256 checksums. "Safe to wipe the card" shows only when every file matches. A report `_ingest-report-<time>.csv` goes in the project. Nothing on the card is ever deleted, moved or renamed. |
| Fix + proxies | Media → **Fix + proxies** | A clip that ffprobe can't read, or that doesn't decode cleanly, gets a clean H.264 copy next to it: `<name>_fixed.mp4`. The original stays as it is. Every video gets a 720p proxy in `_proxies/` (hardware encoder on the M1). Make proxies after Submit, so they carry the final names. |
| LUT first | Settings → Analysis → **D-Log M → Rec.709 LUT** | DJI's "DJI OSMO Pocket 3 D-Log M to Rec.709" LUT is included (in `brand-bible/brands/assets/luts/dji-pocket3/`); choose another file only to replace it. A file whose name or header doesn't mention D-Log/Log is treated as a creative look, and the app asks before using it as step 1. Every DJI clip's preview frames go through it before Claude looks at them, so cards, categories and descriptions work on normal-looking color. DJI tags D-Log M as bt709, so the app doesn't trust the tag: all DJI clips get the LUT unless you switch it off on a card (the **LUT** tag). Your clips are never changed.**Step 2, the creative look:** each channel can have its grade on the card thumbnails, applied after the conversion. @blkgrlco uses The Everyday LUT from the brand bible by default; @blkgrlcotoo's kit is picked per shoot, so choose one in Settings → Analysis if you want it. Thumbnails only: Claude still analyzes the plain converted frames. |
| Flub + silence map | Media → **Flub map** | Whisper listens to every clip with talking and marks your "lululu" / "la la la" flub marker, silences over 0.7 s, and the same line said more than once (ranked: complete, confident, no fillers or pauses; the last take gets a small bonus). It all goes into `_footage-master.md`. Click a card's **flubs** tag to see the map and the transcript. Whisper sometimes drops nonsense syllables, so a stretch of sound with no words shows up as a "possible" flub. |
| Retention loop | Plan → **Edit & retention**, Overview → **What loses viewers** | List the edit's clips in order (drag to reorder, set the seconds used: CapCut can't export this) and link the posted video. 48 hours and 7 days after it posts, the app pulls the audience retention curve and names the clip playing at every drop of 5 points or more. Overview keeps a running table by clip category. Pulls happen while the app is open; if the Mac was off, they catch up on the next start. |

## The Strategy tab (Phase 5)

Pick a channel at the top: @blkgrlco → Nia, @blkgrlcotoo → Zara, the podcast → Amara.

| Sub-tab | What it does |
|---|---|
| Profiles & rules | Her audience profiles (who she is, goals, what she's tried, where she watches, search lanes, channels she follows) and your rules (the Oct 21 hook/title rules, what you can film Thu–Sat, your voice). Missing answers are flagged. **A saved answer is never replaced without your "Yes, replace".** |
| Audience Bullseye | Finds 10–15 channels in her lane (favoring under 100K subscribers with high views), their 3x+ outliers from the last 12 months (outlier = views ÷ the median of that channel's last 30 uploads), groups them into topics and scores each out of 16: audience fit + demand (how many outliers) + competition gap (how many come from small channels) + Thu–Sat filmable, 4 points each. Bullseye chart + ranked list tagged Top / Middle / Bottom of funnel, every number linked to its video. **Send to idea bank** adds the topic's idea to Not started and the dashboard file. |
| Hook Machine | Reusable skeletons (e.g. "i tried [thing] for [time]") found in the top outliers, each with its outlier count, median outlier score and 3 examples. **Generate hooks** writes 5 for one of your ideas in your voice (casual lowercase, one sentence, opinion + curiosity), checks each one (one sentence? lowercase? "day N of 90" kept? "would Nia stop scrolling?") and applies the Oct 21 rules to @blkgrlco dailies and long-forms. **Save to plan** puts the hook (and its title) in that project's Plan → Titles. **Check skeletons against my last 5 videos** compares each skeleton's score with your real 3-second hold. |
| Channel Audit | Your last 50 uploads (12 months): above-median vs below-median views compared by topic, format (from your clip list when there is one), hook skeleton, story map (B1–B5, judged only from a script) and how many viewers are still watching at 0:30. Named patterns, each with a template and 2 of your own videos as proof, plus the "what loses viewers" table. Runs again every Sunday after 6 pm (after the weekly long-form posts), or the next time the app starts. |

Limits, said plainly: YouTube only gives captions for your own videos, so other creators' first 5 seconds are pasted in
(Hook Machine → Opening lines), and their videos are never downloaded. A search costs 100 of the 10,000 daily YouTube
quota units; results are cached for a day.

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
  - **Option 4 (Phase 4):** drag in the DJI card or a footage folder. It ingests into `~/bin-test` (not the T7)
    with the checksum report, proves the card is unchanged, makes fixes and proxies, saves one before/after LUT
    frame, prints the flub map of one talking-head clip (with its transcript, to check against what you said),
    and prints the "what loses viewers" table.
  - **Option 5 (Phase 5):** the Audience Bullseye for @blkgrlco only (top 10 topics with their source videos), then
    each hook skeleton's score against the real 3-second hold of your last 5 videos.

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
  youtube.py   Google sign-in (desktop OAuth + PKCE), channel analytics, videos, retention
  ingest.py    card → _raw with checksums          proxy.py     _fixed copies + 720p proxies
  lut.py       the D-Log M → Rec.709 LUT           flubs.py     flub + silence map
  retention.py edit order, retention pulls, what loses viewers
  strategy.py  profiles, Bullseye, Hook Machine, Channel Audit
  jobs.py      background jobs with progress       scheduler.py retention pulls + Sunday audit
  server.py    API + static files, bound to 127.0.0.1 only
  cli.py       command-line tools used by run-tests.command
web/           the interface (HTML/CSS/JS, no build step): app.js, plan.js, overview.js, tools.js, strategy.js
tests/         unit tests + synthetic footage generator
```
