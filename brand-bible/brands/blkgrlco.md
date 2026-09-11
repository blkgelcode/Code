# @blkgrlco — Personal Development

The flagship channel. Pair with `../BRAND_BIBLE.md` for studio-wide context
(creator bio, production reality, tools, cross-brand editorial toolkit).

## Identity

- Mission: celebrate the resilience, creativity, and self-discovery of Black
  women; empower intentional living through community, mental wellness, and
  a balanced life. *(from `source/blkgrlco-brand-identity-updated.md`)*
- Motto: **Be Free, Be Kind, Be Well.**
- Core values: Resilience, Intentional Living, Self-Care, Creativity,
  Community Connection, Kindness, Authenticity.
- Voice: empowering, authentic, aspirational. Tone: warm, relatable,
  inspiring — storytelling, connection, reflection.
- Governing personal framework: **HOTTER, HEALTHIER, HAPPIER (HHH)** —
  never call this "The Becoming," that name is retired.

## Target Audience

- Demographic: Black women, ages 25–40, prioritizing personal growth,
  intentional living, self-care, exploration.
- Psychographic: creative professionals, entrepreneurs, community-focused
  individuals seeking empowerment, authenticity, adventure.

## Content Structure

Rotates three daily lanes:
- **HOT** — confidence, beauty
- **HEALTHY** — fitness, nutrition (references: the Ladder lifting program,
  CookUnity, skincare cycling)
- **HAPPY** — travel, relationships, lifestyle

Daily shorts rotation: Mon/Thu = HOT, Tue/Fri = HEALTHY, Wed/Sat = HAPPY.
Sunday = long-form vlog mixing the week's recap footage with new
Sunday-only footage.

**Note on "Travel" as a pillar:** the brand identity doc lists Travel as one
of four content pillars directly under @blkgrlco (self-discovery through
travel). This isn't a conflict with @blkgrlcotoo existing as its own
dedicated travel brand — @blkgrlco's own HAPPY lane already covers
travel/relationships/lifestyle as one rotation day, while @blkgrlcotoo is
the fully separate, dedicated travel channel. Flagged so the two aren't
silently merged into one strategy.

## Series

### 90-Day HHH Run
- Premise line: *"I'm hot. I'm healthy. I'm happy — or I will be in 90
  days."*
- Reference standard: **"Day1of90"** — later days match its cut/pacing.
- Locked CTA: **"make your own Pin Board"** — do not use older variants
  like "comment your own rule."
- Locked opener style: declarative present-tense ("I'm hot... so I need to
  beautymaxx") — echo where it fits naturally, don't force into every line.

### "Who Is She?"
- Four pillars: Mental, Physical, Spiritual, Emotional.
- Device: dream-state future-self framing.

### Weekly Vlogs
- Hot/Healthy/Happy segments rotate weekly.

## Daily Vlog Editing Standard
*(Set on "vlog four," applies to every edit from here on — confirmed
2026-09-11, see `../CREATIVE_MEMORY.md`.)*

- Open every vlog on "good morning," letting that sentence finish before
  cutting away.
- Check the head of every clip before cutting — she often starts talking
  1–2s in; cutting from 0:00 buries the first line in silence.
- Cut all dead air, ums, false starts, repeated/re-said phrases (keep one
  clean instance).
- Every cut lands on a body movement, never on her repositioning the
  camera.
- Show a routine's real steps in order (opening the bottle → pouring →
  drinking → taking the meds) — not a generic scene-detection montage.
- Routine/step segments hold 2.5–3.5s per shot.
- Keep personality moments (brain freeze, complaining through a workout,
  reactions).
- Label card on every scene change: Arial Rounded Bold ~170pt,
  RGB(168,177,24), lowercase, centered on a 1920x1080 transparent canvas →
  `assets/cards/l_<name>.png`.
- Always deliver a Shorts cut under 3:00 alongside the master.
- Skip corrupt files/accidental-trigger clips outright, report which.
- Run `_tools/preflight.py` before finalizing any master.

## Technical Specs (this channel's daily/vlog footage)
- Camera: DJI Osmo Pocket 3, D-Log M → apply "DJI OSMO Pocket 3 D-Log M to
  Rec.709" LUT (don't trust the file's own bt709 tag).
- Delivery: true vertical 1080x1920, never pillarboxed landscape.
- Reframe/center face in CapCut *after* the LUT.
- Broken footage: round-trip through a Canva export to MP4.
- Storage: Samsung T7 SSD, `project hhh` folder, one subfolder per video.

## Editorial Frameworks That Apply Here
- **Real-Time Timestamp Cutdown** — rapid micro-cuts stamped with real
  clock time, used for shorts.
- **Challenge/Experiment Script Structure** (Challenge → Exploration →
  Result → Realization → Empower Audience) — for arcs with a real finale
  (e.g. 90-Day HHH Run milestones).
- Talking-head explainer exception applies here: cut ALL dead silence for
  pure explainer content (contrast with the podcast, which never does this).
- From Graphics/SFX reference (Yale Jeannette): stated fit for fast-cut,
  graphic-heavy pop-up/SFX style — build overlay graphics in @blkgrlco's
  own palette (below), not Yale's beige/brown, when this gets built.

## Visual Identity
- Logo: modern, bold, lowercase text — `blkgrlco.`

### Palette — locked 2026-09-11

Confirmed directly (color-generator screenshot). This **supersedes** both
the PDF's named-color description (sage green/terracotta/warm beige/pastel
gold/deep clay orange) and the earlier proposed-hex guesses — those are
superseded, not parallel options.

| Swatch | Hex | Description |
|---|---|---|
| 🟨 | `#F0DAC2` | Warm cream / pale peach |
| 🟫 | `#B68A71` | Warm tan |
| 🟩 | `#B4AD7F` | Sage/olive tan |
| 🟩 | `#636407` | Dark moss olive |
| 🟩 | `#A8B118` | Olive-chartreuse |
| 🩷 | `#EBB9BA` | Blush pink |
| 🟥 | `#8C0532` | Deep berry/wine |
| 🟥 | `#49001B` | Oxblood maroon |
| ⬛ | `#2E1500` | Near-black espresso brown |

**Consistency check:** `#A8B118` is an exact match to the label-card color
already locked in the Daily Vlog Editing Standard above (RGB(168,177,24) =
`#A8B118`) — good confirmation the two were already aligned before this
palette existed.
- Typography: modern serif for titles/branding, clean sans-serif for body.
- Aesthetic: clean, minimalistic, contemporary, soft organic shapes.
- Licensed fonts already embedded in the toolkit: **Advercase** (bold
  display/title-card type), **Editor's Hand** (handwritten captions/quotes,
  Regular weight only). Font files stored at
  `assets/fonts/blkgrlco/`. Full studio font inventory: `../FONT_LIBRARY.md`.
- **Confirmed 2026-09-11: Advercase is the thumbnail font.** One font, per
  the studio-wide "no AI thumbnails, pick one font and stay consistent"
  rule — use Advercase for thumbnail headline text going forward, not
  Editor's Hand (that stays scoped to handwritten captions/quotes).

## Verified Creator References
*(structural technique only — framing, pacing, narration style — never
voice/persona/content imitation)*
- **heynatalibrown** (TikTok) — diary pacing, mundane-to-striking shot
  progression. Applies to HOT/HAPPY.
- **Azhai Boggs** (@azhai.boggs) — intentional framing, background/
  wardrobe/lighting as brand assets. Applies to HOT.
- **Jayla Henry** (Dallas) — narrates over ordinary footage like a running
  diary, avoids tutorial tone. Applies to HEALTHY.
- **Eni** (NYC) — humor plus unvarnished honesty in small moments. Applies
  to HAPPY.
- "Aurelia Gray" / "Rachel McDermott" — aesthetic matches, handles
  unconfirmed. Don't treat as verified until she supplies a real handle.

## SEO / Hashtags / Titles / Descriptions
- Core terms: hot healthy happy, glow up, confidence, beauty, fitness,
  nutrition, self-improvement, accountability.
- Hashtag tiers: broad (#glowup) / niche (#90dayplan) / brand
  (#blkgrlco, #hothealthyhappy).
- Hook patterns (Idea Bank): Identity Call, Contrarian Strike, Open Loop,
  Confession, Results First, Mistake Warning, Direct Question,
  POV/Relatable.
- See `../../growth/SEO_GUIDE.md` for shared voice rules and title/
  description/hashtag workflow.

## Visual & Content References (2026-09-11, confirmed @blkgrlco visual identity)

- **Real content example (HEALTHY lane):** a Stories-style screenshot of a
  home Pilates session with the TV playing the actual "Pilates by Izzy"
  video being followed. Good live confirmation of the "name the specific
  activity, never the vague vibe" rule — worth this concrete, not "getting
  healthy." Caption style here: white serif text, bottom placement — this
  reads as a **casual Story caption**, not the locked daily-vlog label-card
  spec (Arial Rounded Bold, olive green, lowercase) — don't conflate the
  two; different context.
- **HOT/HEALTHY glow-up moodboard** (Pinterest, attributed to the BLKGRLCO
  account itself — stronger signal than a generic inspo board, but still
  curated reference imagery, not her own body/footage): glossy nude lips,
  sculpted collarbone/back, toned abs, natural curly hair, glossy natural
  nails, bright smile. Confirms the "glow up" keyword (already in
  `../../growth/SEO_GUIDE.md`) with a concrete visual mood — Medium
  confidence, not a locked look.
- **Creativity-pillar moodboard:** podcasting/mic setup, vinyl/record
  shopping, painting, sketchbook, dance studio mirror, a sign reading "YOU
  ARE WAY TOO CREATIVE FOR A 9 TO 5." That last one lands close to her
  actual life (day job vs. creative studio) — worth flagging as a genuine
  personal-story angle/hook, not just an aesthetic reference.
- **Quote-card reference:** bold black sans headline + small-caps justified
  body copy on cream ("Girl, be too much."). Matches the brand voice
  (empowering, authentic, aspirational) closely — candidate template for
  carousel/quote posts, not yet built or locked.
- **Photographic reference:** a glam, motion-blurred night portrait —
  long-exposure blur aesthetic, likely for HOT-lane or personal-highlight
  content. Technique reference only.

## Connected Tools
- **Metricool** — connected here (owner: blktrvler@gmail.com); linked to
  Instagram, Pinterest, TikTok, and YouTube (@blkgrlco: 120 subs / 4
  videos as of connection). This is the account with real posting history.
- vidIQ is **not** connected here (it's pointed at @blkgrlcotoo).
