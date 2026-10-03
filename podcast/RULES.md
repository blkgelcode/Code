# The Ugly In Between — Locked Episode Rules

Locked by Omnia on 2026-10-03. These override anything in
`PLAYBOOK.md` or any role brief that conflicts with them. If a role thinks
a rule is wrong for a specific episode, it flags it in the episode's
`_inbox/from_code.md`. It never decides on its own.

Every rule here is checked by
`.claude/skills/podcast-episode/scripts/verify.py` before anything is
reported as done.

| # | Rule | What "met" means | How it's verified |
|---|---|---|---|
| R1 | **Nothing publishes without her sign-off.** | The chain stops at "ready for sign-off." No uploads, schedules, or posts to any platform (Metricool, YouTube, TikTok, Instagram, OpusClip, Rella, vidIQ). Publishing tools are also denied in `.claude/settings.json`. | Process rule, plus the settings deny list |
| R2 | **−16 LUFS on both audio and video.** | Every deliverable (audio master, video master, every vertical) measures −16 LUFS integrated, ±0.5 LU. | `ffmpeg ebur128` on each file |
| R3 | **Cold open stays music-free.** | The music bus is silent (below −60 dB peak) from the cold open's start to its end. | `ffmpeg volumedetect` on the music stem over that range |
| R4 | **One consistent intro/outro across every episode.** | Same theme file, intro card, and outro card, byte-for-byte, in every episode. The first approved episode sets the lock in `locked.json`. | sha256 against `locked.json` |
| R5 | **Captions on every video and vertical.** | Each video and vertical has an SRT that runs to the end of her speech. Verticals also have captions burned in, which the orchestrator checks by eye on extracted frames. | SRT parse + frame grabs |
| R6 | **Her words only.** Code orders and trims; it never rewrites her voice. | Every word in every deliverable and every caption is a run of words she actually said, in the raw recording. No added, paraphrased, or "cleaned up" lines, including in captions. Titles, descriptions, and show-note framing are packaging and may be written, but any quote attributed to her must be verbatim. | Transcript coverage check against the raw transcript |
| R7 | **Show notes reuse the blog post's resources block.** | The show notes contain the blog post's "Resources" block verbatim. If the blog block is still a placeholder, the episode is blocked, not filled in. | Normalized substring check |

## Intro / outro (locked 2026-10-03)

- **Theme:** *"I Deserve Better (Instrumental Version)"*, spring gang,
  Epidemic Sound recording `9a1a4af2-55e9-3bbe-8614-b9a26a6fae83`
  (93 BPM, 3:06, stems available: instruments / bass / drums).
- **Order:** cold open (no music) → intro (theme + intro card) → episode →
  outro.
- **Outro:** her own recorded **"Stay ugly."** sign-off line, with the
  theme coming in under it, then the outro card. The line is her words
  from the footage, never generated or re-recorded by Code. If an
  episode's footage has no sign-off take, flag it. Don't borrow one from
  another episode without asking.
- The theme edit, intro card, and outro card are built once, on the first
  episode, and approved by her. `locked.json` then records their hashes,
  and every later episode reuses the same files.

## Brand rules that still apply (from `brand-bible/brands/uglyinbetween.md`)

One take; keep voice cracks, sighs, and pauses. The documentarian rule
applies fully: never cut her silence the way explainer content gets cut.
Minimal-to-no music beyond the locked theme. B&W high-contrast look.
Thumbnail headlines in Eighties Comeback. No AI-generated thumbnails, ever.
