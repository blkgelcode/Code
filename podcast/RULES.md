# I Wish Somebody Had Told Me — Locked Episode Rules

Locked by Omnia on 2026-10-03. They're the same seven rules as the
"Standing rules (locked)" in the playbook (the Production System tab of
her [Show Hub doc](https://claude.ai/artifact/M7L7vsPcDpSUj27pyG8jt6)),
with one addition: R1 also covers Drive and Rella. If the doc and this
file ever disagree, flag it in `_inbox/from_code.md`. Don't pick one.

Every rule here is checked by
`.claude/skills/podcast-episode/scripts/verify.py` before anything is
reported as done.

| # | Rule | What "met" means | How it's verified |
|---|---|---|---|
| R1 | **Nothing publishes, and nothing goes to Drive, Rella, or any platform, without her sign-off.** | Before a `SIGN-OFF: Ep N` line exists in that episode's `from_chat.md`, nothing is written, uploaded, copied, shared, scheduled or posted to Google Drive, Rella, YouTube, TikTok, Instagram, Spotify for Creators, Substack, her website, Metricool, OpusClip, vidIQ or any other platform. Reading her Show Hub doc and Drive docs is allowed. After sign-off, Code may copy approved files to Drive only if the sign-off entry asks for it. Code never publishes. She does. | Skill gate on the sign-off line. In `.claude/settings.json`, publishing tools are denied and Drive/Rella write tools require approval every time. |
| R2 | **−16 LUFS everywhere: audio-only exports and video both.** | The audio master (MP3), the YouTube long-form and every vertical each measure −16 LUFS integrated, ±0.5 LU. | `ffmpeg ebur128` on each file |
| R3 | **The cold open stays music-free.** No intro music over the first hook. | The music bus is silent (below −60 dB peak) from the cold open's start to its end. | `ffmpeg volumedetect` on the music stem over that range |
| R4 | **One consistent intro and outro across every episode.** | Same theme file, intro card and outro card, byte-for-byte, in every episode. The first approved episode sets the lock in `locked.json`. | sha256 against `locked.json` |
| R5 | **Captions on every video and every vertical** (most people watch muted). | The long-form and each vertical have an SRT that runs to the end of her speech. Verticals also have captions burned in, which the orchestrator checks by eye on extracted frames. | SRT parse + frame grabs |
| R6 | **Her words only.** Code orders and trims; it never rewrites her voice. | Every word in every deliverable and caption is a run of words she actually said in the raw recording. Nothing is added, paraphrased, "cleaned up", censored or bleeped (her language is raw on purpose). Titles, descriptions and show-note framing are packaging and may be written, but any quote attributed to her must be verbatim. | Transcript coverage check against the raw transcript |
| R7 | **Show notes reuse the blog post's resources block** (RAINN where relevant, LifeStance, 988). | `copy/resources_block.md` is a verbatim span of that episode's blog post: from its first resource sentence through the 988 line. The show notes contain it verbatim. | Substring checks: block ⊂ blog post, block contains 988, block ⊂ show notes |

## Where things live (confirmed 2026-10-03)

| What | Where |
|---|---|
| Raw footage | Her T7 SSD, which mounts as **Untitled**. She uploads each episode's files into the cloud session. |
| Working files | The cloud session: `podcast/episodes/epNN/media/` (gitignored; gone when the session ends) |
| Final masters | Back to the T7 (**Untitled**). Code sends them to her in the session, and she saves them there. |
| Spec, copy, inbox, verify report | This repo, `podcast/episodes/epNN/` |
| Scripts, blog posts, playbook | Her Show Hub doc (read live) |

Masters are named `EpNN_<deliverable>.<ext>` (e.g. `Ep03_audio_master.mp3`)
so they can sit side by side on Untitled without clashing.

## Playbook specs that verify.py also checks

- **Audio master:** MP3, stereo, ID3 tags for show name (album), episode
  number (track) and title. Season goes in the disc tag (`TPOS`); it's a
  WARN if missing, since ID3 has no season field.
- **Verticals:** 2–3 per episode, 9:16.

## Intro / outro (locked 2026-10-03)

- **Theme:** *"I Deserve Better (Instrumental Version)"*, spring gang,
  Epidemic Sound recording `9a1a4af2-55e9-3bbe-8614-b9a26a6fae83`
  (93 BPM, 3:06, stems available: instruments / bass / drums). The same
  theme is used for intro and outro. The playbook's one-time setup asks to
  confirm it's licensed for podcast use.
- **Order** (Show Hub's locked structure): cold open (dry, nothing before
  it) → intro (theme + intro card) → story and reflection → the advice →
  disclaimer folded into the close → "it's okay to ask for help" + the
  resources block → **outro: her sign-off with the theme under it** →
  cold end.
- **Sign-off:** her own recorded lines for that episode, which flex per
  episode ("Signed, a ___" / "Stay ___", as written in the script). They're
  never generated or borrowed from another episode. If the footage has no
  sign-off take, flag it.
- The theme edit, intro card and outro card are built once, on the first
  episode, and approved by her. `locked.json` then records their hashes,
  and every later episode reuses the same files.

## Show rules that also bind every role (from the Show Hub)

- **Never show a media clip** (TV scene, podcast, book footage) on any
  version, including video. The scene is described in words. Credit the
  show, and any fan edit that inspired the scene, in the description.
- **Language is raw and uncensored on purpose.** Nothing gets toned down.
- No AI-generated thumbnails, ever (studio rule). The visual identity
  (look, palette, type, thumbnail font) is **under review** since the
  2026-10-03 rename, so propose and ask rather than assume the old B&W /
  aubergine-terracotta / Eighties Comeback look.
