# thumbnail — mexico-city-weekend

## Made
- `copy/thumbnail.md` has three concepts in words, a recommendation, frames
  that were considered and rejected, and a fallback shot list.
  - **A "the confession" (recommended for YouTube 1280×720):** 0245
    ~0:11–0:28 on the bench. Headline **FILMING IN PUBLIC** in Advercase,
    secondary *for the first time* in Editor's Note.
  - **B "the donuts":** 0238 ~0:00–0:14. **I EARNED THESE** / *no sleep, a
    4-hour walk*.
  - **C "the yellow dress" (recommended for the 1080×1920 Shorts cover):** 0254
    552–600 s. **I LOOK SO PRETTY** / *night two*.
- `manifest.json`: `thumbnail_youtube` now has `status` set to concepts-only,
  and `source_frame` and `text` are `null` until she chooses. I added a
  `thumbnail_cover` (1080×1920, `ai_generated: false`) entry the same way.
- No images were made. The footage isn't in the session (it's on Drive), and
  this stage is words only.

## Deviations
- No frames were pulled and no 320 px check renders were made, because there
  was no footage. Text sizes are measured from the font files instead: an
  Advercase headline at 110–120 px gives about 26 px caps at phone size, and
  Editor's Note stays at 60 px or larger.
- The thumbnail and cover are proposed as two different concepts (A and C).
  The cover entry is new in the manifest, and verify.py will FAIL T3 on both
  until they're built.

## Rules checked
T1 (real frames only, manifest flag set), T2 (Advercase headline + Editor's
Note secondary, no other fonts), G3 (palette-only text colors), T3 (sizes,
phone-size check planned, and the duration-stamp and TikTok UI zones kept
clear), T4 (the split is described, but titles.md didn't exist yet, so it
**must be re-checked**), T5 (fallback shot list for next time), T6 (no retired
terms), C12 (reference missing, flagged), P4 (frames aren't pushed toward the
palette). Privacy: the thumbnail text and frames avoid all Gray spans, and
0254 is limited to 552–600 s.

## Open questions for her
1. Is this @blkgrlco or @blkgrlcotoo? If it's @blkgrlcotoo, the fonts and
   palette change and the concepts need redoing.
2. Which reference should the thumbnail match? Day1of90's thumbnail, or
   another?
3. Which concept: A, B or C? Is it OK for the YouTube thumbnail and the
   Shorts cover to differ (A + C)?
4. Was the trip solo? "Alone" only goes on the thumbnail if she confirms it.
5. Is she OK leading with the Pokémon donuts (Concept B)? No character names
   would appear in the text either way.
6. If none of the logged frames gives a sharp, centered face, she can shoot
   the 2–3 stills listed at the end of `copy/thumbnail.md`.

## For packaging / QC
Keep "filming", "public", "first time", "earned", "pretty" out of the title
if the matching concept is chosen. Once `copy/titles.md` lands, re-run the T4
split.
