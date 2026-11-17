# editor: mexico-city-weekend

**Status: PAPER EDIT.** Built only from her log (`media/docs/_moments.json`).
There's no footage or transcript in this session, nothing was rendered and
nothing was committed.

## Made
- `copy/edl.md`: the full long-form timeline, 116 shots, **~9:52**. Each row
  has the master running time, picture source + in/out, audio source when
  it differs (VO / J-cut), kind, what's on screen, her words (from log,
  check against transcript), label card, music/SFX slot, and the reason.
  It also has the through-line, rule placements, the C10 transition audit,
  the card list, sound notes, a clip key with the grade path per camera, an
  extension reserve and CapCut finishing steps.
- `spec.md` → `## Structure`: 14 section rows with raw in/out and notes.
- `manifest.json`: `copy.edl`, `shots` (116 shots, `start`/`end`/`kind` plus
  `src`/`in`/`out`), `shots_status`, `chapters` (13 chapters starting at 0:00),
  `estimated_runtime_s`, and `master` (status: not rendered). I merged into
  the manifest. The packaging, shorts and thumbnail keys are untouched.
- Not made: `media/out/…_master.mp4` and `media/transcripts/master.txt`. Both
  need footage.

## The cut
Cold open on the Red "longest longest day of my life" → 4-clip "coming up"
→ travel day told by her 5:19 PM bed recap as VO over the real flight,
terminal and lunch footage → blue apartment (rear-camera POV tour) → night
1: step count, Pokémon donuts → Saturday "Good morning" → meds near-miss as
a J-cut into water, meds, down → get-ready routine → streets → Panaderia
Rosetta → **the confession at 6:05** (no B-roll, no music) → park, croissant
→ Uber ("I'm upset… I was supposed to put out a video") → San Angel → El
Bazar Sabado → back home: **"not a fan of eating outside" at 8:10** →
Saturday night (picture only, yellow dress) → last morning, "being where I
wanna be" over a recap → end cold on "see y'all at the airport."

## Deviations from spec / brief
- **Runtime ~9:52, under the 12–14 min target (L1).** After the C4/C9/L6
  trims the log doesn't support 12 minutes, and real C4 trims will likely
  land around 9:00–9:30. The EDL lists ~2:53 of extension reserve that
  would bring it to ~12:00. L1 pulls against C4/L6 here. I flagged it and
  didn't choose.
- **Retention tease at 7:40, not 8–10 min (L4).** At ~10 min the window is
  the last two minutes, with nothing left to tease. It moves to ~9:00 if
  she takes the extension.
- **Cut "have a good day"** after "see y'all at the airport" as a filler
  sign-off (C11). **This conflicts with the shorts EDL, which keeps it.** One
  of the two should match the other.
- **C4 vs C8 on the airport bit:** she says it 8 times. I kept ~3 repeats
  as a jump-cut build.
- **Dropped** the tretinoin purchase talk, the "just hanging out" talk and
  most of the step-count, street and Uber talk (L6). All of it is listed in
  the reserve.
- **Every `~` in/out is an estimate inside a logged span.** All of them get
  re-cut from `raw_words.json` (C3/C4) with frames checked at each cut (C6).
- **Public chapter title** for 3:49 is "Saturday morning". That keeps
  medication out of public copy, matching packaging's choice. The EDL
  itself plans the meds beat because she tagged it Green.

## Rules checked
C2, C3 (marked per clip), C4, C5 (no "lululu" in the log), C6 (avoids
every logged camera-turn/hand-at-lens span), C7 (meds, get-ready and night
routines at 3.0 s per step, real order), C8, C9, C10 (audit table, 2 gaps
flagged), C11, C12 (no invented text: the text pop on the tease is a
NEEDS INPUT slot), L1 (flagged), L2, L3 (no talking run > 20 s; verify's
shot check passes with no C7/L3 warnings), L4, L5 (chapters in the
manifest for packaging), L6, G1 (11 card slots), D1 (M1–M6 are slots, not
picks), P2/P3 (grade path per camera in the clip key). Privacy: the Gray
spans appear only as "skip (private)". 0254 1380–1384 is her own Yellow
picture-only tag inside the private span; its audio is never used.

## For the orchestrator
- **Packaging** can take `manifest.chapters` for the description. Its
  chapters are still TBD.
- The **Google Drive connector appeared mid-session** (tools now listed). I
  didn't use it, because this stage is paper only. It may unblock footage
  access for the next run.

## Open questions for her
1. **Brand** (@blkgrlco vs @blkgrlcotoo) and **reference** (Day1of90?). That
   decides the grade, and whether the last card is `l_sunday` or `l_day_22`.
2. **Runtime:** a tight ~10 min, or put the reserve back to reach ~12?
3. **Return trip from San Angel:** any footage (Uber or walking in)? If not,
   is "Okay, so I'm back" plus a card OK as the transition?
4. **Where was 4536** ("no other way to get to the airport", 10:57 AM)? Is
   there any landing footage from flight 1?
5. **Music** for slots M1–M6 (D1), and any SFX.
6. **Output frame** for the long-form master: 16:9 YouTube or 1080×1920?
7. **Yellow dress:** did she go out in it? The cut treats it as a night-in
   moment.
8. Keep or cut **"have a good day"** at the end, and should the Shorts match?
