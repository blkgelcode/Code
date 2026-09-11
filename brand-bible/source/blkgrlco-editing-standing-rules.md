<!--
Source document, preserved verbatim. Provided directly by the brand owner as
standing rules (not inferred from an example), so these are treated as
approved/permanent and merged into BRAND_BIBLE.md, STYLE_GUIDE.md,
SCRIPTWRITING_GUIDE.md, and agents/PRODUCTION_WORKFLOW.md rather than held
as a tentative pattern. Ingested 2026-09-11. If this file is ever updated,
re-run the merge into those files.
-->

# BLKGRLCO Studios — Editing Standing Rules

## Creative philosophy (applies to everything)
- Documentarian style: open mid-action, end cold, no filler sign-offs — except her own "bye bye," which always stays.
- Music is chosen before shooting, not added in post.
- Prioritize specific, real detail over production polish.
- In a montage, every clip must move the story forward — cut any shot that just sits on a state already shown.

## Silence & pacing — depends on the project
- **Talking-head / explainer videos**: cut ALL dead air, streamline pacing hard. This is a deliberate exception to the rule below.
- **The Ugly In Between**: keep pauses, sighs, voice cracks. Do NOT streamline — the raw, unproduced pacing is the point.
- Any take marked with "lululu" (shows up in transcripts as "la la la" or similar) is her in-take flub marker — cut that take.

## Technical specs
- Camera: DJI Osmo Pocket 3, shot in D-Log M. Footage needs the "DJI OSMO Pocket 3 D-Log M to Rec.709" LUT — DJI mis-tags the files as bt709, so don't trust the file's own tag.
- Delivery: true vertical 1080x1920. Never pillarboxed landscape.
- Reframe / center her face in CapCut *after* the LUT is applied — don't bake reframing into un-graded footage.
- If footage won't import or transcribe: drop it into a Canva design and export back out as MP4. The re-encode has fixed files that failed direct import.

## Storage
- Source footage and project folders live on the Samsung T7 SSD ("project hhh" folder, one subfolder per video).
- Google Drive is the secondary/backup route — large-file downloads stall, so T7 is the reliable path.

## Reference standard
- "Day1of90" is the style/pacing reference for the 90-Day HHH Run — match later days in that series to its cut.

## Editor
- Primary edit tool is CapCut.

## Retention & pacing (long-form YouTube)
- Trim long talking-head explanations to the essentials — audience wants the chaos/payoff, not the full logistics.
- Never open "hey guys, welcome back" — open on a question, a bold statement, or a preview of what's coming.
- Any talking-head segment over 20 seconds needs B-roll cut over it.
- Target 12–14 min runtime for long-form vlogs; past that, it needs retention hooks to earn the extra length.
- Flash a 3–4 clip "coming up" preview right after the cold open/title card.
- Pattern interrupts every 2–3 min — text pop-ups, quick graphics, humor cards.
- Plant a mid-video retention tease around the 8–10 min mark.
- Chapter markers, always.
- Titles specific and viewer-focused, not generic.

## Templates & design
- Match her reference example exactly — no improvised structural or decorative elements (no trend-text, stickers, borders) unless they're in the reference.
- Don't guess at a format she hasn't shown yet — ask for the reference first.
- Vertical daily-vlog template locked: 4-panel edge-to-edge stacked timestamp grid (6AM/12PM/6PM/10PM), bold plain white captions, no decorative elements.

## Daily vlog edit standard (set on vlog four — applies to every edit from here on)
- Open every vlog on "good morning," and let that opening sentence finish before cutting away.
- Check the head of every clip before cutting — she often starts talking a second or two in, so cutting from 0:00 buries the first line in silence.
- Cut all dead air, ums, and false starts out of talking-head audio.
- Cut repeated words and re-said phrases — keep one clean instance, drop the rest.
- Every cut lands on a body movement, never on her repositioning the camera.
- Show a routine's real steps in order — opening the bottle, pouring it, drinking it, taking the meds — not a generic scene-detection montage.
- Routine and step segments hold 2.5–3.5s per shot. Sub-second cuts are too fast to read what's happening.
- Keep the personality moments: the brain freeze, complaining through a workout, the reactions.
- A label card on every scene change. House style: Arial Rounded Bold ~170pt, RGB(168,177,24), lowercase, centred on a 1920x1080 transparent canvas, saved to `assets/cards/` as `l_<name>.png`.
- Always deliver a Shorts cut under 3:00 alongside the master — a condensed version of the whole vlog, not one segment stretched out.
- Skip corrupt files and accidental-trigger clips outright, and say which ones were skipped.
- Before finalizing any master, run the pre-flight check (`_tools/preflight.py`) and report the results — verify every rule in this file is met and every correction asked for during the session actually landed. Don't call an edit done until it passes.

---
<!-- Add new standing rules here as they come up, one bullet, plain language. -->
