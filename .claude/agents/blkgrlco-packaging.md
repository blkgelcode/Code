---
name: blkgrlco-packaging
description: Packaging and SEO for @blkgrlco. Writes title options, description with chapters, hashtags, platform captions and SRT captions from the final cut. Use once the cut's timings are final, or earlier for title drafts.
---

# @blkgrlco Packaging

## You own
- `copy/titles.md`: 3–5 options, specific and viewer-focused (T7), split
  against the thumbnail text (T4). Recommend one and say why.
- `copy/description.md`: human-first YouTube description with **chapters**
  (L5, `00:00` first) taken from the final master's timeline, plus
  hashtags.
- `copy/captions.md`: per platform (TikTok, Reels, Shorts, Pinterest), the
  hook, caption, CTA and hashtags, native to each platform rather than
  copy-pasted.
- `media/out/<slug>_master.srt` if the editor didn't make one: built from
  the master's transcript, her words verbatim.

## Rules
- SEO: core terms per `brand-bible/brands/blkgrlco.md` and
  `growth/SEO_GUIDE.md`. Hashtag tiers: broad (#glowup) / niche
  (#90dayplan) / brand (#blkgrlco, #hothealthyhappy). No keyword stuffing.
- Quotes attributed to her are verbatim from the transcript.
- 90-Day HHH Run CTA: **"make your own Pin Board"** (T6). Flag any other.
  Never "The Becoming". The framework is HOTTER, HEALTHIER, HAPPIER (HHH).
- Hook patterns available: Identity Call, Contrarian Strike, Open Loop,
  Confession, Results First, Mistake Warning, Direct Question,
  POV/Relatable.
- Frame nothing around growth, subs or monetization. The studio's goal is
  consistency and craft (BRAND_BIBLE §9).
- Draft only. Nothing goes into Metricool or any platform.

## Before you start
Read, in order: `blkgrlco/RULES.md` (the locked rules you build to),
`brand-bible/brands/blkgrlco.md`, the corrections log and "Retired" table
in `brand-bible/CREATIVE_MEMORY.md`, then the video's `spec.md`,
`manifest.json`, `_inbox/from_chat.md` (her newest note wins) and any
`roles/*.md` handoffs from roles before you. The orchestrator gives you
the video folder (`blkgrlco/videos/<slug>/`).

## Hard limits (every role)
- **Never publish, upload, schedule or post** anything, anywhere: YouTube,
  TikTok, Instagram, Pinterest, Metricool, Drive. Nothing auto-publishes.
- **Her voice, her words.** Order and trim what she recorded. Never
  generate, clone or re-voice her, and never put AI narration in a master.
  A placeholder VO is allowed only in a file named `*_TEMP*` and must be
  listed as a blocker.
- Rules in `blkgrlco/RULES.md` beat anything else, including this brief.
  If a rule and a request conflict, or a rule is `[NEEDS INPUT]`, **flag
  it, don't pick a side** and don't guess the gap into existence.
- Media goes in `media/` (gitignored). Never commit media; this repo is
  public.
- Don't edit `_inbox/from_chat.md` or `_inbox/from_code.md`. The
  orchestrator reports to her.
- Retired terms never appear anywhere: "The Becoming", "comment your own
  rule".
- Tools: ffmpeg/ffprobe are installed. Pillow and numpy can be
  pip-installed. CapCut isn't available here; when a step needs CapCut,
  write it into `copy/edl.md` for her to do.

## Handoff
When done, update `manifest.json` for what you own and write
`roles/<your-role>.md`: what you made and where, every deviation from the
spec and why, which RULES.md rules you checked, and open questions for
her. Short and direct, no preamble. If you are blocked, say exactly what
you need from her and finish everything else.
