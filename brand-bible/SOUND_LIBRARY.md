# Sound & Music Library

Concrete inventory of licensed music and sound effects (Epidemic Sound),
per brand. This holds actual track/SFX picks — the *rules* for how audio
gets used (when to cut silence, what SFX pairs with which cut style, "no
graphic or transition should be silent") already live in
`STYLE_GUIDE.md` and aren't repeated here. Mirrors the structure of
`FONT_LIBRARY.md`.

Status: scaffold only as of 2026-09-11 — nothing populated yet.

---

## Music editing technique (confirmed 2026-09-11, Arthur's Cut Theory)

- **Edit to the beat** — use a beat-detection plugin to mark beats on the
  timeline, cut to those markers. Tool named in source as "Brinkly.io,"
  unverified spelling — confirm before relying on it.
- **De-esser-as-ducking for voiceover** — instead of a flat volume drop,
  apply a de-esser to the music track and curve it to carve a frequency
  pocket the voiceover sits in.

## Music

| Brand | Mood/direction | Confirmed tracks | Notes |
|---|---|---|---|
| @blkgrlco | `[NEEDS INPUT]` | — | Music chosen before shooting, not added in post (studio-wide rule) — so this should reflect what's actually picked pre-shoot, not a generic mood board. |
| @blkgrlcotoo | `[NEEDS INPUT]` | — | |
| @uglyinbetween | Minimal-to-no music (production approach, already locked) | — | Given the one-take/raw documentary rule, confirm whether this library applies at all here, or only for rare moments (e.g. a Match Cut/Smash Cut beat). |

## Sound Effects

**Rule (confirmed 2026-09-11, Arthur's Cut Theory):** don't pick one sound
per transition type and reuse it — pick a *set* of variations at different
registers (low hit / mid whoosh / high texture) so repeated transitions
don't stack identical SFX. Applies to whooshes and similar transition
sounds especially. See `STYLE_GUIDE.md`.

| Brand | Use case | Confirmed SFX | Notes |
|---|---|---|---|
| @blkgrlco | Label-card pops, pattern interrupts, transitions | `[NEEDS INPUT]` | Cross-ref the SFX-per-cut-style table in `STYLE_GUIDE.md` (film-reel clack for montages, paper-swoosh for graphic pop-ins, abrupt silence for Smash Cut, rhythmic taps for Jump Cuts) — specific Epidemic Sound picks for each go here once chosen, as a low/mid/high set where it's a repeated transition sound. |
| @blkgrlcotoo | Object-label callouts, transitions, graphic pop-ins | `[NEEDS INPUT]` | The Yale Jeannette SFX logic (pop/click on text, camera-shutter on freeze-frames, paper-tear on wipes, whoosh on slides, mouse-click on mock-UI) is the rulebook — this table is where the actual licensed sound for each becomes concrete. |
| @uglyinbetween | `[NEEDS INPUT]` | — | Not a stated fit for the Yale Jeannette SFX-heavy style (see `STYLE_GUIDE.md`) — if this brand uses SFX at all, it's likely sparse/different in kind, not the same picks as the other two brands. |

## SFX reference clips (2026-09-11)

4 reference video clips stored at `brands/assets/sfx-reference/` — "sound
effects I want to have on hand." A 5th upload was an exact byte-for-byte
duplicate of clip 3 (same source TikTok video, re-uploaded) and wasn't
stored separately.

**I can't identify what's in these** — this session has no video/audio
playback capability (no ffmpeg or similar available, and installing one is
blocked by the sandbox's network policy), so these are stored as opaque
reference files, not analyzed. Need a short description of each (what the
actual sound is) before they can be turned into real Epidemic Sound
picks or added to the per-brand tables above:

| File | Source | What it is |
|---|---|---|
| `clip-1-1cbf2c9b.mp4` | TikTok | `[NEEDS DESCRIPTION]` |
| `clip-2-988c9b4a.mp4` | TikTok | `[NEEDS DESCRIPTION]` |
| `clip-3-83926a7c.mp4` | TikTok (uploaded twice, deduped) | `[NEEDS DESCRIPTION]` |
| `clip-4-5e6079d8.mov` | Local export (not a TikTok download — different filename pattern, likely her own extracted/edited clip) | `[NEEDS DESCRIPTION]` |

Also unconfirmed: which brand(s) these apply to — not stated.

## Connected tool

**Epidemic Sound** — confirmed in use as of 2026-09-11. Not yet documented
in `BRAND_BIBLE.md` §8 (Connected Tools) — added there as a stub; update
with account/plan details once relevant.
