# {{SLUG}} — implementation spec

Written at intake, **before any build work starts**. Every role builds to
this. A role that needs to deviate updates this spec and logs why in its
`roles/<role>.md`.

## Intake
- Working title: <…>
- Type: <daily_short | daily_vlog | sunday_vlog | series_episode | explainer>
- Lane / series: <HOT | HEALTHY | HAPPY> · <90-Day HHH Run day N | Who Is She? | Weekly Vlog N | none>
- Platforms: <YouTube long-form | Shorts | TikTok | Reels | Pinterest>
- Central topic (one line, decided before filming): <…>
- Reference to match (C12): <Day1of90 | her named reference | MISSING → blocker>
- Music picked before shooting (D1): <track | MISSING → ask>
- Script / VO / shot list: <copy/script.md | to write | n/a>
- Footage: <file, duration, size, camera, D-Log M? — one row each>
- Skipped files (corrupt / accidental trigger): <list or none>
- Transcript: `media/transcripts/raw.txt` + `raw_words.json` (<tool used, or blocked + why>)
- Open notes from `_inbox/from_chat.md`: <list or none>
- Blockers: <list or none>

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
`python3 .claude/skills/blkgrlco-video/scripts/verify.py blkgrlco/videos/{{SLUG}} --frames`
then QC's frame review. Her `_tools/preflight.py` on the Mac before she
calls it final (A2).
