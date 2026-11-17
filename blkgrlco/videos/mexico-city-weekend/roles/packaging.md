# packaging: mexico-city-weekend

**Status: DRAFT.** Built from her `_moments.json` log only. There's no
footage, transcript, EDL or final timeline in the session. Every piece of
copy assumes @blkgrlco, HAPPY lane, 90-Day HHH Run. The brand is still to
be confirmed.

## Made
- `copy/titles.md`: 5 options plus a @blkgrlcotoo alternate. Recommended:
  **First Time Filming in Front of People | A Weekend in Mexico City**.
  It has the one central topic (correction 4), is specific (T7) and puts
  the searchable place name inside ~70 characters.
- `copy/description.md`: a description in her voice (Fri → Sat → Sun from
  the log), draft chapters (`00:00` first, the rest `TBD` from the final
  cut), and tiered hashtags.
- `copy/captions.md`: TikTok (Confession), Reels (POV/Relatable), Shorts
  (Open Loop), Pinterest (Results First, written for search). Each has a
  caption, CTA and hashtags written for that platform.
- `manifest.json`: added `copy.captions` and a `packaging` block (status,
  recommended title, chapter status, CTA condition). Merged in, not
  overwritten.
- **Not made:** `media/out/mexico-city-weekend_master.srt`. There's no
  footage or transcript in the session. It gets built when the master
  exists.

## Deviations from spec
- **Chapters are an outline, not timecodes.** No `copy/edl.md` or manifest
  `chapters` existed at either check. They're in log order and need
  re-timing from the cut. L5 passes the `00:00` check, but the chapters
  aren't final.
- **All quotes are log quotes,** marked in each file. None are verified
  against a transcript.
- **The description has her taking the burger back to the apartment.**
  That's inferred from 0253 ("Okay, so I'm back" + the bite), not stated.
  It's flagged in the file.
- **Hooks are per caption, not per spoken opening.** There's one Shorts
  cut, so it has one opening line. The recommended one is the 0236 Red
  "longest longest day of my life". Different spoken openings would need
  separate cuts.
- **The cover text was handed to the thumbnail role,** which owns the
  single 1080×1920 cover. No captions repeat its proposed words.

## T4: title × thumbnail split (needs a decision)
`copy/thumbnail.md` arrived mid-run. Its recommended Concept A headline,
**FILMING IN PUBLIC / for the first time**, spends the same phrase as the
recommended title. Running verify's overlap logic gives ratio 1.00, so it
would WARN. There are two clean pairings:
1. **Packaging's pick:** title option 1 plus the thumbnail role's own
   fallback for A, **A LITTLE DAUNTING** / *alone in a new city*.
   Overlap 0.00. The title is the situation and the thumbnail is the
   feeling, in her own words. Check "alone" first (solo trip not
   confirmed).
2. Title option 2 (Mexico City on Zero Sleep…) plus Concept A as the
   thumbnail role recommended it. The title is the place and trip, and
   the thumbnail is the topic. Concept B's "ZERO SLEEP" direction then
   clashes with this title.
The description's opening line was rewritten so it doesn't spend
"daunting". The TikTok caption still quotes it ("it's a little bit
daunting", log quote). That's on a different platform from the YouTube
thumbnail, so it's fine.

## Rules checked
- **T4:** split as above. Thumbnail phrase notes are kept out of
  `titles.md` so verify's substring check stays meaningful.
- **T6:** "make your own Pin Board" is in the description and all four
  captions, conditional on HHH Run. The retired terms were scanned for and
  are absent from `copy/` and this file.
- **T7:** every title uses logged specifics (standby, blue apartment,
  Pokémon donuts, San Ángel / El Bazar Sábado, 100-peso burger, first time
  filming in public). Hashtags cover the broad, niche and brand tiers,
  with no stuffing (YouTube 8, TikTok 7, Reels 6, Shorts 3, Pinterest 3).
- **L5:** chapters start `00:00`. Times are TBD.
- **C12:** no on-screen trend-text was proposed for the video until she
  names a reference.
- **A1:** nothing scheduled, uploaded or posted. Nothing went to Metricool.
- **BRAND_BIBLE §9:** no growth, subscriber or monetization framing
  anywhere.
- **Privacy:** no Gray span is referenced. The health-related 0239 Green
  moment and anything to do with medication are left out of all public
  copy. Seatback name screen not used.

## Open questions for her
1. **Brand:** @blkgrlco or @blkgrlcotoo? Titles, hashtags and the CTA all
   change. The @blkgrlcotoo alternates are in each file ("Young & Outside
   in Mexico City", #traveltiktok / #blackgirltravel / #blkgrlcotoo /
   #youngandoutsideinmexicocity, no locked CTA).
2. **HHH Run:** is it part of the Run? If so, should the title carry the
   day like "Day 1 of 90"? Only the last clip is logged "day 22". The team
   didn't guess Friday's or Saturday's day numbers.
3. **CTA fit:** is "make your own Pin Board" right on a travel-weekend
   video? It's used because the Run's CTA is locked. Drop it if not.
4. **The 7:48 AM 0239 Green moment:** does any of it go in public copy?
   It's left out until she says so.
5. **Solo trip:** confirm, before "alone" goes in any title or thumbnail.
6. **Sign-off:** should descriptions close with "Be Free, Be Kind, Be
   Well."? Nothing is locked for @blkgrlco.
7. **Spelling:** accents on San Ángel / Bazar Sábado / Panadería, or her
   log spelling without them?
8. **Pinterest board name, and any links** for the description.
9. **#blackgirltravel on @blkgrlco:** left off to keep the brands
   separate. Add it?
10. **T4 pairing:** option 1 + "A LITTLE DAUNTING", or option 2 + "FILMING
    IN PUBLIC"?

## Blocked on footage
Chapter timecodes, quote verification, the master `.srt`, and the final
title check against what the cut actually keeps (the 0245 confession).
