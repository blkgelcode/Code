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
| # | Section | Source in/out (raw timecode) | B-roll / graphics | Notes |
|---|---|---|---|---|
| 1 | Cold open / "good morning" (C1, C2) | | | |
| 2 | Coming-up preview, 3–4 clips (L2, long-form only) | | | |
| 3 | … | | | |
| n | Cold end / "bye bye" if she said it (C11) | | | |

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
