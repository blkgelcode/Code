# Ep {{N}} — implementation spec

Written at intake, **before any build work starts**. Roles build to this.
If a role needs to deviate, it updates this spec and logs why in
`_inbox/from_code.md`.

## Intake
- Title / script doc / blog post: <from EPISODES.md row N>
- Footage: <paths, takes, durations, recording date>
- Raw transcript: `media/transcripts/raw.txt` (+ word timestamps)
- Open notes from `_inbox/from_chat.md`: <list, or "none">
- Blockers: <e.g. blog resources block is a placeholder (R7), no "Stay ugly." take (outro)>

## Structure (her words only: R6)
| # | Section | Source in/out (raw timecode) | Notes |
|---|---|---|---|
| 1 | Cold open (no music: R3) | | |
| 2 | Intro (locked theme + card: R4) | — | |
| … | | | |
| n | Outro: "Stay ugly." + theme under it + outro card | | |

Trims and reorders only. List every cut with its reason. Pauses, sighs,
and cracks stay (documentarian rule).

## Deliverables
| id | kind | spec | captions | owner role |
|---|---|---|---|---|
| audio_master | audio | −16 LUFS (R2) | n/a | audio master |
| video_master | video | look per spec (identity under review), −16 LUFS | SRT (R5) | video edit → audio master |
| vertical_NN | vertical | 1080×1920, −16 LUFS | SRT + burned-in | verticals |
| copy | text | titles, description, show notes (R7), thumbnail concepts | — | packaging |

## Role briefs
Per `podcast/PLAYBOOK.md`, plus anything episode-specific.

## Verify plan
`python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/ep{{NN}}`
plus a visual check of the burned-in caption frames.
