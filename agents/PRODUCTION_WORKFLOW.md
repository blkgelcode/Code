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

- **System of record: Notion** — Studios Hub, Content Calendar DB, Idea
  Bank DB. *"If it's not in Notion, it's not real yet."* Hub page ID:
  `3c77c3ea-6a8c-812b-8d56-e54b8ad3fa36`. Content Calendar data source:
  `collection://385c26ae-18f0-4b17-887e-ee4943716796`.
- Source footage and project folders: Samsung T7 SSD, `project hhh` folder,
  one subfolder per video. Google Drive is backup-only (large downloads
  stall there).
- Camera: DJI Osmo Pocket 3, D-Log M — apply the correct LUT rather than
  trusting the file's own (mis-tagged) color-space metadata. (@blkgrlco /
  @blkgrlcotoo shooting style — @uglyinbetween has its own production
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
