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
is better), monetization potential, brand alignment. State the total and the
reasoning — this is a decision aid, not a hard cutoff.

## Technical & storage notes (BLKGRLCO)

- Source footage and project folders: Samsung T7 SSD, `project hhh` folder,
  one subfolder per video. Google Drive is backup-only (large downloads
  stall there).
- Camera: DJI Osmo Pocket 3, D-Log M — apply the correct LUT rather than
  trusting the file's own (mis-tagged) color-space metadata.
- Editor: CapCut.
- Footage that won't import/transcribe: round-trip through a Canva export
  to MP4 before retrying.

Full detail in `brand-bible/source/blkgrlco-editing-standing-rules.md` and
`brand-bible/STYLE_GUIDE.md`.

## Competitor intelligence

For each competitor: what they cover, formats, what titles/thumbnails
perform, how they hook/structure, what their audience responds to, what gaps
exist. Always resolve to: **what works → why it works → our original
version** — never a copy.
