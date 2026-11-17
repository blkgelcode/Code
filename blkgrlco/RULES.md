# @blkgrlco — Locked Video Rules

The rules the @blkgrlco video team builds to and `/blkgrlco-video`'s
verify step checks against. **Everything here is compiled from locked
rules in `brand-bible/`.** Nothing is invented. Each rule names its
source. If a source doc changes, update this file to match. The source
wins on any disagreement, and the disagreement gets flagged, not quietly
resolved.

Anything still `[NEEDS INPUT]`, "reference only" or "candidate" in the
brand bible is deliberately left out (exact grade numbers beyond the LUTs,
music/SFX picks, the Yale Jeannette graphics pack, the quote-card
template). Ask her rather than guessing those into existence.

Sources: `brand-bible/source/blkgrlco-editing-standing-rules.md` (SR),
`brand-bible/brands/blkgrlco.md` (BRAND), `brand-bible/STYLE_GUIDE.md`
(STYLE), `brand-bible/CREATIVE_MEMORY.md` (MEM).

## Approval

| # | Rule | Source | Checked by |
|---|---|---|---|
| A1 | **Nothing publishes.** No uploads, scheduling or posting anywhere (YouTube, TikTok, IG, Pinterest, Metricool). Masters are handed to her; she publishes. | BRAND_BIBLE, PRODUCTION_WORKFLOW | orchestrator |
| A2 | An edit isn't done until the pre-flight passes: every standing rule met, every correction from the session landed. Her `_tools/preflight.py` runs on her Mac; `verify.py` is the in-session check. | SR | verify + QC |

## Picture

| # | Rule | Source | Checked by |
|---|---|---|---|
| P1 | Delivery is **true vertical 1080×1920**. Never pillarboxed landscape. | SR, STYLE | verify (size + black-bar detect) |
| P2 | Color, in this order: base corrections → **D-Log M → Rec.709 conversion LUT** (`brand-bible/brands/assets/luts/dji-pocket3/DJI_OSMO_Pocket_3_D-Log_M_to_Rec.709_V1.cube`) → **The Everyday LUT** (`brand-bible/brands/assets/luts/blkgrlco/The Everyday LUT.cube`) → finishing/black levels. Never trust the file's bt709 tag. Never use a creative LUT as the conversion step. | SR, BRAND | verify (manifest `color`) + QC frames |
| P3 | Reframe/center her face **after** the LUT. Never reframe un-graded footage. | SR | colorist → editor order |
| P4 | Skin tones natural, never distorted for style. | STYLE | QC frames |
| P5 | Unimportable footage: round-trip through a Canva export to MP4 (her step; ask her). Corrupt files and accidental-trigger clips are skipped outright and listed. | SR | spec + QC |

## Cut

| # | Rule | Source | Checked by |
|---|---|---|---|
| C1 | Daily vlogs open on **"good morning,"** and that sentence finishes before cutting away. | SR, BRAND | verify (transcript) |
| C2 | Long-form never opens "hey guys, welcome back." Open on a question, a bold statement or a preview. | SR | verify (transcript) |
| C3 | Check each clip's head: she often starts talking 1–2 s in. Never cut from 0:00 blindly. | SR | editor |
| C4 | Talking head: cut all dead air, ums, false starts, repeated/re-said phrases (keep one clean instance). | SR, STYLE | verify (filler count) + QC |
| C5 | A take with "lululu" / "la la la" is a flub marker: cut the whole take. | SR | verify (transcript) |
| C6 | Every cut lands on a body movement, never on her repositioning the camera. | SR | QC frames |
| C7 | Routines show the real steps in order. Routine/step shots hold **2.5–3.5 s**. | SR | editor + verify (shot lengths, WARN) |
| C8 | Keep personality moments (brain freeze, complaining mid-workout, reactions). | SR | QC |
| C9 | Montage: every clip moves the story forward. Cut shots that sit on a state already shown. | SR, STYLE | QC |
| C10 | Never cut straight from talking in one place to talking in another. Use the real transition (walking out, car, arriving). Test: with eyes closed, could you hear a transition? | MEM, STYLE | QC |
| C11 | Documentarian: open mid-action, end cold, name the specific activity. No filler sign-offs, **except "bye bye," which always stays.** | SR, STYLE | QC |
| C12 | Match her reference exactly: no improvised trend-text, stickers or borders. A format she hasn't shown yet → ask for the reference first. **"Day1of90"** is the reference for the 90-Day HHH Run. | SR | spec (blocker) + QC |

## Long-form (Sunday vlog / YouTube)

| # | Rule | Source | Checked by |
|---|---|---|---|
| L1 | Target **12–14 min**. Longer needs retention hooks to earn it. | SR | verify (WARN) |
| L2 | A 3–4 clip **"coming up" preview** (her word: "trailer") right after the cold open/title card. | SR, MEM | spec + QC |
| L3 | Any talking-head stretch over **20 s** gets B-roll over it. | SR | editor EDL + verify |
| L4 | Pattern interrupt every 2–3 min (text pop-up, quick graphic, humor card). Mid-video retention tease around 8–10 min. | SR | editor EDL |
| L5 | **Chapter markers, always.** | SR | verify (description) |
| L6 | Trim long talking-head logistics to the essentials. | SR | editor |

## Graphics & templates

| # | Rule | Source | Checked by |
|---|---|---|---|
| G1 | **Label card on every scene change:** Arial Rounded Bold ~170 pt, RGB(168,177,24) `#A8B118`, lowercase, centered on a 1920×1080 transparent canvas, saved as `assets/cards/l_<name>.png`. | SR, BRAND | verify (cards) |
| G2 | Vertical daily-vlog template: 4-panel edge-to-edge stacked timestamp grid (6AM / 12PM / 6PM / 10PM), bold plain white captions, no decorative elements. | SR | QC frames |
| G3 | Palette (locked 2026-09-11): `#F0DAC2` `#B68A71` `#B4AD7F` `#636407` `#A8B118` `#EBB9BA` `#8C0532` `#49001B` `#2E1500`. Logo: lowercase `blkgrlco.` | BRAND | graphics + QC |

## Shorts

| # | Rule | Source | Checked by |
|---|---|---|---|
| S1 | **Always deliver a Shorts cut under 3:00 alongside the master:** a condensed version of the whole vlog, not one segment stretched out. | SR | verify (exists + duration) |

## Sound

| # | Rule | Source | Checked by |
|---|---|---|---|
| D1 | Music is chosen **before shooting**, not added in post. If the spec has no pre-picked track, that's a question for her, not something to fill in. | SR | spec (blocker) |
| D2 | Under voiceover, carve a frequency pocket in the music (de-esser-as-ducking) rather than only a flat volume drop. | STYLE, SOUND_LIBRARY | sound |
| — | No locked loudness target for @blkgrlco (−16 LUFS is a podcast lock). Team default: −14 to −16 LUFS integrated, true peak ≤ −1 dBTP, reported not enforced. | — | verify (WARN only) |

## Thumbnails & packaging

| # | Rule | Source | Checked by |
|---|---|---|---|
| T1 | **No AI-generated thumbnails, ever.** Built from her real frames/photos. | MEM, STYLE | verify (manifest flag) + QC |
| T2 | **Advercase** is the only headline font. **Editor's Note** for secondary text. Editor's Hand only for handwritten captions/quotes. Fonts: `brand-bible/brands/assets/fonts/blkgrlco/`. | BRAND | thumbnail + QC |
| T3 | YouTube 1280×720; TikTok/IG cover 1080×1920. Check legibility at phone size. | STYLE | verify (size) |
| T4 | Thumbnail and title never spend the same phrase. Split the hook. | STYLE | verify (overlap) + QC |
| T5 | Thumbnail shots are decided before filming, alongside the shot list. | MEM, PRODUCTION_WORKFLOW | scriptwriter |
| T6 | Retired, never use: "The Becoming" (→ HOTTER, HEALTHIER, HAPPIER / HHH), "comment your own rule" (→ **"make your own Pin Board"**, the locked 90-Day HHH Run CTA). | MEM, BRAND | verify (text scan) |
| T7 | Titles specific and viewer-focused, not generic. Hashtag tiers: broad (#glowup) / niche (#90dayplan) / brand (#blkgrlco, #hothealthyhappy). | SR, BRAND | packaging |

## Where things live

- Raw footage: her Samsung T7 (`project hhh/<video>/`). She uploads a
  video's files into the session; working copies go in
  `blkgrlco/videos/<slug>/media/` (gitignored, never committed: this repo
  is public).
- System of record: the BLKGRLCO Studios dashboard artifact (not Notion).
- Editor of record: CapCut. The team's cut is an assembly/rough cut plus an
  EDL she can finish in CapCut, unless she asks for a finished master.
