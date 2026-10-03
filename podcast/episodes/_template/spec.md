# Ep {{N}} — implementation spec

Written at intake, **before any build work starts**. Roles build to this.
If a role needs to deviate, it updates this spec and logs why in
`_inbox/from_code.md`.

## Intake
- Title / stage / spark: <from the Show Hub lineup>
- Show Hub doc rev built to: <rev>
- Script + blog post: copied verbatim to copy/script.md, copy/blog_post.md
- Resources block: copy/resources_block.md (verbatim span of the blog post)
- Media-sparked? <no | source to credit; no clip anywhere>
- Footage: <paths, takes, durations, recording date>
- Raw transcript: `media/transcripts/raw.txt` (+ word timestamps)
- Open notes from `_inbox/from_chat.md`: <list, or "none">
- Blockers: <e.g. no sign-off take (outro), footage missing>

## Structure (Show Hub's locked structure; her words only: R6)
| # | Section | Source in/out (raw timecode) | Notes |
|---|---|---|---|
| 1 | Cold open: the moment, or the scene described in words (dry: R3) | | |
| 2 | Intro (locked theme + card: R4) | — | |
| 3 | Story and reflection | | |
| 4 | The advice: "what I wish someone had told me" | | |
| 5 | Disclaimer folded into the close | | |
| 6 | "It's okay to ask for help" + resources | | |
| 7 | Sign-off ("Signed, a ___" / "Stay ___") + theme under it → cold end | | |

Script cut tight (playbook): trims and reorders only, never re-wording.
List every cut with its reason. Punch-ins and b-roll go over the heavy
talking sections, and never show a media clip.

## Deliverables
| id | kind | spec | captions | owner role |
|---|---|---|---|---|
| audio_master | audio | MP3, stereo, ID3 tags, −16 LUFS (R2) | n/a | audio master |
| video_master | video (YouTube) | look per spec (identity under review), −16 LUFS | SRT (R5) | video edit; captions by packaging |
| vertical_NN (2–3) | vertical (TikTok/Reels) | 9:16, −16 LUFS | SRT + burned-in | vertical |
| copy | text | title, thumbnail concept, show notes (sources + resources + chapters, R7), clip credit | — | packaging |

## Role briefs
The Production System tab's agent sections, verbatim (doc rev above), plus anything episode-specific.

## Verify plan
`python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/ep{{NN}}`
plus a visual check of the burned-in caption frames.
