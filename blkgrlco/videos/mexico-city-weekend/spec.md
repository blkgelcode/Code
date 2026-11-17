# mexico-city-weekend — implementation spec

Written at intake, **before any build work starts**. Every role builds to
this. A role that needs to deviate updates this spec and logs why in its
`roles/<role>.md`.

## Intake
- Working title: Mexico City weekend (Fri 9/25 – Sun 9/27/2026)
- Type: sunday_vlog (long-form YouTube, 12–14 min target) + Shorts cut
- Lane / series: HAPPY · **assumed** 90-Day HHH Run (the last clip is
  logged "day 22"). **To confirm:** @blkgrlco, or @blkgrlcotoo (the travel
  channel)? The brand bible flags this exact overlap. It changes the LUT
  kit and the rules, so nothing gets rendered until she answers.
- Platforms: YouTube long-form, YouTube Shorts / TikTok / Reels
- Central topic (draft, hers to confirm): a weekend alone in Mexico City
  while working on confidence: filming in front of people for the first
  time, not loving eating with people watching, and still going.
- Reference to match (C12): **MISSING.** Day1of90 if this is an HHH Run
  vlog; otherwise she names one.
- Music picked before shooting (D1): **MISSING.** Ask her; don't pick.
- Script / VO / shot list: none. This is a found-footage vlog cut from
  her `_moments.json` log (`media/docs/_moments.json`, gitignored).
- Footage: 42 clips logged (DJI Osmo Pocket 3 `DJI_*_D.MP4`, D-Log M;
  iPhone `IMG_*.MOV`, not log, so they skip the conversion LUT). **Not
  in this session yet:** she's uploading it to Google Drive, which this
  session can't reach.
- Log tags (inferred from her notes): Red = hook/anchor · Green = key
  moment · Orange = usable talk · Purple = personality/bit · Yellow =
  picture/B-roll · Gray = skip.
- Logged usable time: Red 19 s · Green 122 s · Orange 457 s · Purple
  109 s · Yellow 694 s (mostly B-roll under talk). Gray 2,290 s skipped.
- Skipped files (P5, from the log): 0235, 4541, 4557, 0250, 0255, 0257
  (camera starts, blur, swings). Gray spans inside clips are skipped too,
  including private ones, which never
  get described in committed files.
- Transcript: none yet. Quotes in the paper edit are from her log and
  must be checked against a word-level transcript once footage arrives.
- Open notes from `_inbox/from_chat.md`: none
- Blockers: brand · reference · music · footage access

## Structure
Paper edit from her log (editor, 2026-11-17). Estimated **9:52**, about 2:08 under L1; see
`copy/edl.md` → Extension reserve. Seconds are raw clip times from
`_moments.json`. VO = audio from another clip laid under the picture.
Every reason and every `~` estimate is in `copy/edl.md`.

| # | Section (master time) | Source in/out (raw seconds, short clip id) | B-roll / graphics | Notes |
|---|---|---|---|---|
| 1 | Cold open (0:00.0–0:07.0) | 0236 0–7 | cards: — | Red hook, bold statement (C2). Dry, no music. |
| 2 | Coming up (L2) (0:07.0–0:19.0) | 0238 0–3; 0239 129.4–132.4; 0252 62–65; 0254 552–555 | cards: — | 4 clips × 3 s. Doesn't spend the confession. |
| 3 | Travel day: flying standby (0:19.0–2:15.3) | 4528 0–4.24 (VO 0237 15.06–19.3); 4528 4.24–10.5 (VO 0237 19.3–25.56); 4531 0–9.94 (VO 0237 25.56–35.5); 4532 0–11 (VO 0237 278.3–289.3); 4532 25–35.7 (VO 0237 289.3–300); 4532 36–38.2 (VO 0237 309.6–311.8); 4533 0–6 (VO 0237 311.8–317.8); 4536 0–3.44; 4536 3.44–12; 4538 0–3 (VO 0237 327–330); 4539 0–5 (VO 0237 330–335); 4539 5–8 (VO 0237 335–338); 4540 0–3.6 (VO 0237 338–341.6); 4542 0–2.4 (VO 0237 341.6–344); 4544 0–3 (VO 0237 401–404); 4551 0–6 (VO 0237 404–410); 4551 6–10 (VO 0237 452–456); 4555 0–3 (VO 0237 456–459); 4556 28–31 (VO 0237 459–462); 4556 52–55 (VO 0237 462–465); 4558 0–2.8 (VO 0237 465–467.8); 4559 0–2.2 (VO 0237 467.8–470); 4560 36–40; 0236 50–56 | cards: `l_travel_day` | 5:19 PM bed recap as VO over the day's real footage, in order. Airport bit = interrupt. Lunch clips muted (source music). C10 flag: no landing footage before 4536. |
| 4 | The blue apartment (2:15.3–2:57.8) | 0236 219.9–225.4; 0236 234.5–239.8; 0236 241.7–251; 0236 261.1–266.1; 0236 276.9–285.1; 0236 291.1–294.3; 0236 298.6–304.6 | cards: `l_the_blue_apartment` | Rear-camera POV tour (rooms on screen). C4: one "gorgeous view", one bathroom exit line. |
| 5 | Night 1: no sleep, the donuts (2:57.8–3:49.2) | 0237 37.5–41.16; 0237 41.16–45.44; 0237 73.9–80; 0237 101–105; 0238 0–14.31; 0238 30–35; 0238 104.9–114.9; 0238 124.9–128.9 | cards: — | Step count + donuts = interrupts. Donut display (3:25 PM) planted in section 3. |
| 6 | Saturday morning: the meds near-miss (3:49.2–4:47.1) | 0239 0.95–6.4; 0240 20–28.8 (VO 0239 16.7–25.5); 0239 129.4–136; 0239 171.95–180.6; 0239 190–193 (VO 0239 180.6–183.6); 0239 193–196 (VO 0239 183.6–186.6); 0239 196–199; 0240 3.6–7; 0240 7–15; 0240 72–80 | cards: `l_saturday` | Red "Good morning" opens the day. Meds: J-cut into water → meds → down (C7). Toothbrush = interrupt. |
| 7 | Getting ready (routine) (4:47.1–5:35.1) | 0241 179–183; 0241 187–190; 0241 208–211; 0241 226–229; 0241 244–247; 0241 304–307; 0241 430–433; 0241 573–576; 0241 600–603; 0241 690–693; 0242 3.5–9.9; 0242 107–111; 0242 126.3–132.9 | cards: — | C7 steps at 3.0 s, real order. Replaces tretinoin-purchase talk (L6). |
| 8 | Out: streets to Panaderia Rosetta (5:35.1–6:01.1) | 0243 16–24; 0243 154–158; 0243 182–190; 0244 20–26 | cards: `l_out_exploring`, `l_panaderia_rosetta` | Walking out = real transition (C10). Cafe music muted. Ordering span skipped. |
| 9 | The confession + the park (6:01.1–6:49.1) | 0245 0–3.5; 0245 11–22.3; 0245 24–28.8; 0246 40–46 (VO 0245 138–144); 0246 46–52; 0247 59.4–66.3; 0247 70–75; 0247 97.6–102.1 | cards: `l_the_park` | THE CONFESSION: no B-roll, no music. J-cut into the park. |
| 10 | Uber to San Angel (6:49.1–7:13.2) | 0248 0–4.6; 0249 13.8–20.3; 0249 20.3–24.3; 0251 3–9 (VO 0249 24.3–30.3); 0251 9–12 | cards: `l_san_angel` | "my Uber is he-- ooh!" = interrupt + transition. Green upset line feeds the through-line. |
| 11 | El Bazar Sabado + retention tease (7:13.2–7:43.5) | 0252 62–68; 0252 89.7–95; 0252 160–164; 0252 180–184; 0252 235–239; 0252 380–384; 0254 558–561 | cards: `l_el_bazar_sabado` | Picture-led montage. Retention tease at 7:40 (L4: early, flagged). C10 flag: no return footage. |
| 12 | Back home: not a fan of eating outside (7:43.5–8:44.9) | 0253 0–4.5; 0253 11–24.7; 0253 68–76.3 (VO 0253 35.3–43.6); 0253 53.6–65; 0253 76.3–80; 0253 118–131.8; 0253 250–256 | cards: `l_back_home` | Verbal bridge "Okay, so I'm back". Through-line beat 2. OUT ≤131.8 and <260 (skip spans). |
| 13 | Saturday night (picture only) (8:44.9–9:16.9) | 0254 280–283; 0254 290–293; 0254 552–558; 0254 1380–1384; 0256 0–4; 0256 368–371; 0256 380–383; 0256 501–504; 0256 540–543 | cards: `l_saturday_night` | Picture only (TV audio). Yellow dress pays off the preview + tease. |
| 14 | Last morning, end cold (9:16.9–9:52.3) | 0258 10.75–17.75; 0258 40.5–42.4; 0258 54.95–62.7; 0258 85.6–88.6; 0240 30–33.1 (VO 0258 88.6–91.7); 0243 40–43 (VO 0258 91.7–94.7); 0246 64–67 (VO 0258 94.7–97.7); 0254 300–303.2 (VO 0258 97.7–100.9); 0258 141–144.5 | cards: `l_sunday` | Resolution over a recap of unused frames (L3). End cold on "see y'all at the airport" (C11). No "bye bye" logged. |

List every cut with its reason. Scene changes get a label card (G1).
Transitions between locations use real transitional footage (C10).

## Deliverables
| id | kind | spec | owner |
|---|---|---|---|
| master | vertical or longform | 1080×1920 vertical (P1) or YouTube long-form | editor (+ colorist, sound) |
| shorts | vertical | 1080×1920, < 3:00, condensed whole video (S1) | shorts |
| cards | png | `assets/cards/l_<name>.png` per G1 | graphics |
| thumbnail | png | 1280×720 and/or 1080×1920, real frames, Advercase (T1–T4) | thumbnail |
| copy | text | titles, description + chapters, hashtags, captions | packaging |
| edl | text | `copy/edl.md` — the cut as a CapCut-ready list | editor |

## Verify plan
`python3 .claude/skills/blkgrlco-video/scripts/verify.py blkgrlco/videos/mexico-city-weekend --frames`
then QC's frame review. Her `_tools/preflight.py` on the Mac before she
calls it final (A2).
