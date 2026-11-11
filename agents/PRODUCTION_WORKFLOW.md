# Production Workflow

The pipeline every new video/content idea runs through, and the approval
system that sits on top of it.

## The 13 steps

1. **Understand the idea** — topic, objective, audience, platform, format,
   desired emotion, desired action. **Confirmed rule (2026-09-11 vlog
   feedback):** decide the single central topic before filming, and list
   the shots needed for both the video *and* the thumbnail up front.
   Unplanned shoots read as chaotic/all-over-the-place on screen —
   audiences increasingly favor vlogs built around one focused topic over
   broad "yapping."
2. **Research** — Research Agent produces the strongest, verified angle.
3. **Strategy** — angle, hook, title concepts, thumbnail concepts, search
   opportunity, retention strategy.
4. **Script** — Scriptwriting Agent, in brand voice.
5. **Editing plan** — Video Editor Agent, timestamped blueprint.
6. **Visual plan** — B-roll, graphics, text, animations, images, screen
   recordings, references.
7. **Audio plan** — music, SFX, silence, audio transitions, voice emphasis.
8. **Color plan** — Color Grading Agent, per `brand-bible/STYLE_GUIDE.md`.
9. **Thumbnails** — Thumbnail Design Agent, multiple concepts.
10. **SEO** — titles, description, keywords, tags/hashtags, chapters.
11. **Repurposing** — platform-specific derivative content
    (`growth/CONTENT_STRATEGY.md`).
12. **Quality control** — Content QC Agent checklist against Brand Bible.
    For BLKGRLCO edits specifically: before finalizing any master, run the
    pre-flight check (`_tools/preflight.py`) and report the results —
    verify every standing rule in `brand-bible/source/blkgrlco-editing-standing-rules.md`
    is met and every correction given during the session actually landed.
    An edit isn't done until it passes.
13. **Final approval** — human sign-off before anything publishes, unless
    autonomous publishing has been explicitly authorized for that content
    type.

Shortcut rule: if you only ask for one step ("write the script", "make the
thumbnail"), you get only that step's output — not the full pipeline. Full
pipeline runs only when you hand off a new idea to build out end-to-end.

## Editing an HHH daily (@blkgrlco) — Claude Code procedure

From her HHH Weekly Edit Breakdown (ingested 2026-11-11, verbatim in
`../brand-bible/source/blkgrlco-hhh-weekly-edit-breakdown.md`; the seven
story types are summarized in `../brand-bible/brands/blkgrlco.md`). It
supplies the video-specific editing approach for step 5 above. It does
not reinstate fixed durations, and it does not override privacy,
source-preservation, or approval rules.

```text
Select the matching weekly video type before editing.
Inspect the source footage and transcript; do not infer events from the calendar.
Write the episode's true goal, outcome, and story question in one sentence each.
Use its example timeline as a starting structure, never a compulsory runtime.
Create a source-timecoded edit decision list using the project's existing schema.
For each cut or reorder, explain its effect on clarity, progress, or connection.
Keep meaningful personality and remove repeated information.
If essential context or a result is missing, flag it; never invent a voiceover or outcome.
Render one low-resolution preview and validate captions, audio, framing, and chronology.
Report what changed and why; do not claim retention has improved before audience data exists.
Do not publish, overwrite originals, or change my treatment/training routine.
```

Two things the procedure refers to are not in this repo (flagged in
`../brand-bible/CREATIVE_MEMORY.md`, 2026-11-11):

- **"The Workflow Reset prompt"** — she said to use the breakdown
  alongside it. Not found here. Until she supplies it, the standing rules
  above and in `../brand-bible/` apply.
- **"The project's existing schema"** for the edit decision list. The
  closest thing here is BLKGRLCO Bin's clip order (Plan → Edit &
  retention: an ordered list of `{fid, seconds}` per clip, names and
  categories from the Media tab, which the retention loop matches against
  drops) plus the per-clip flub/silence map in `_footage-master.md`. An
  edit decision list written for an HHH daily should at least be
  reducible to that clip order so the retention loop can read it.

The Daily Vlog Editing Standard (`../brand-bible/brands/blkgrlco.md`) and
the pre-flight check in step 12 still apply to every HHH daily.

## Human approval system

Before a major/irreversible decision, present:
- Recommended option
- Alternative option
- Reason for the recommendation
- Expected benefit
- Potential risk

You approve, reject, or modify. Corrections get logged in
`brand-bible/CREATIVE_MEMORY.md` so they aren't repeated — a correction is
not treated as a universal rule until it recurs or you explicitly say "always
do this."

## Testing & experimentation

For meaningful content, define A/B opportunities (titles, thumbnails, hooks,
openings, CTAs, formats) before publishing, track results in
`growth/ANALYTICS_SYSTEM.md`, and avoid changing multiple major variables at
once without a stated strategic reason.

## Decision framework for choosing between ideas

Score each candidate idea 1–5 on: audience relevance, demand, search
opportunity, trend potential, originality, competition level (lower is
better), story potential, retention potential, production difficulty (lower
is better), and brand alignment. State the total and the reasoning — this
is a decision aid, not a hard cutoff.

**Deliberately excludes monetization potential** — the studio's actual goal
is consistency and craft, not growth/revenue (see
`brand-bible/BRAND_BIBLE.md` §9). Weighting ideas by monetization potential
would work against that on every decision, not just the big ones.

## Shot-list framework (BLKGRLCO Studios)

Shorthand: **EW** (Establishing Wide), **WS** (Wide Shot), **MS** (Medium
Shot), **CU** (Close Up), **AM** (Action/Movement), **OS** (Overhead Shot),
**ECU** (Extreme Close-Up).

Scene structure: Intro → Key Scene 1 through 6 → Closing thoughts/Outro.
Each scene: FILMED checkbox, reference photo, B-ROLL IDEAS, SCRIPT lines
tagged by shot type. Shots needed for the thumbnail get decided at this
stage too, alongside the shot list — not found/cropped after filming.

Pipeline: **Plan → Film → Edit → Upload → Reflect** (this maps onto the
13-step pipeline above: Plan = steps 1–3 + visual/audio/color planning,
Film = production itself, Edit = steps 5, 8, 12, Upload = step 13, Reflect
= the Sunday post-mortem — what worked, what to improve, next goals — feeds
`growth/WEEKLY_REPORT_TEMPLATE.md`).

## Production reality & schedule

- Solo creator with a full-time job (Mon–Fri 3pm–12am).
- Weekday mornings = opportunistic capture only.
- Saturday = batch film day.
- Sunday = edit/upload/reflect/plan.
- @blkgrlcotoo (travel) is the one exception — filmed only on vacation
  days/weekends off, never squeezed into the weekday rhythm.

## Technical & storage notes (BLKGRLCO Studios, all brands unless noted)

- **System of record: the BLKGRLCO Studios dashboard** (claude.ai artifact
  https://claude.ai/artifact/UZu9ZMKxs7FyTR9UMHxBKn) — one record per piece
  of content, across all three channels. Not Notion (2026-10-26: "No Notion").
  Ideas and ticked titles arrive from BLKGRLCO Bin (`apps/blkgrlco-bin/`)
  through its `bin-export.json`: dashboard → Data → Imports & Code → Import
  from BLKGRLCO Bin.
- Source footage and project folders: Samsung T7 SSD, `project hhh` folder,
  one subfolder per video. Google Drive is backup-only (large downloads
  stall there).
- Camera: DJI Osmo Pocket 3, D-Log M — apply the correct LUT rather than
  trusting the file's own (mis-tagged) color-space metadata. (@blkgrlco /
  @blkgrlcotoo shooting style — @iwishsomeonetoldme has its own production
  approach, see `brand-bible/brands/uglyinbetween.md`.)
- Editor: CapCut.
- Footage that won't import/transcribe: round-trip through a Canva export
  to MP4 before retrying.
- **Publishing approval:** nothing auto-publishes for any brand. Every
  script, edit, caption, thumbnail, and scheduled post — including
  anything queued in Metricool — goes through Omnia for approval first.

Full detail in `brand-bible/source/` and `brand-bible/STYLE_GUIDE.md`.

## Competitor intelligence

For each competitor: what they cover, formats, what titles/thumbnails
perform, how they hook/structure, what their audience responds to, what gaps
exist. Always resolve to: **what works → why it works → our original
version** — never a copy.
