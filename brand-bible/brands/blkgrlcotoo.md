# @blkgrlcotoo — Travel

Pair with `../BRAND_BIBLE.md` for studio-wide context.

## Identity
- Series: **"Young & Outside in [Location]"** — renamed 2026-08 from
  "Young Hot & Outside" (itself renamed from "Fuck It Book It"/"STAMPED").
  **Never use the retired names.**
- Recurring series: **SCENT PASSPORT** (fragrance-focused shorts).
- Draws on standby flight benefits and her sister as a frequent travel
  companion.

## Production Constraints
- Only filmed on vacation days or weekend offs — **never** squeezed into a
  weekday capture window. This is the one BLKGRLCO brand exempt from the
  weekday-opportunistic-capture rhythm that governs the other two.

## Typography

**Confirmed 2026-09-11: TAN Memories and Perfectly Nineties** (both
nostalgic serifs, Regular + Italic each). Font files at
`assets/fonts/blkgrlcotoo/`. Full studio inventory: `../FONT_LIBRARY.md`.

**Confirmed 2026-09-11: TAN Memories is the thumbnail headline font**
(Advercase's role for @blkgrlco). Perfectly Nineties is secondary/accent
use. No open items on this brand's typography.

## Visual Identity / Brand Palette

**Locked 2026-09-11** (coolors.co/palette/284376-e58e47-d9d1c7-ca5278-6177a8):

| Swatch | Hex | Description |
|---|---|---|
| ⬛ | `#284376` | Deep navy blue |
| 🟧 | `#E58E47` | Warm marigold/orange |
| ⬜ | `#D9D1C7` | Warm sand/greige |
| 🟪 | `#CA5278` | Raspberry pink |
| 🟦 | `#6177A8` | Dusty periwinkle blue |

This supersedes the earlier "no fixed palette locked yet, pull from
destination footage" placeholder — this is now the standing @blkgrlcotoo
palette for thumbnails, graphics, and title cards. Still pull specific
color *grading* from the actual destination/footage per shoot; this
palette governs graphic elements (thumbnails, text, overlays), not a
mandate to color-grade every location's footage identically.
Otherwise follows studio-wide thumbnail composition rules (face centered
and readable, no clutter, don't duplicate the title phrase, correct
platform specs).

### Visual reference board (Pinterest "blkgrlcotoo visual identity," 2026-09-11)
Inspiration/technique board, not her own footage — treat as candidate
direction, not a locked look. Confidence: Medium. Recurring techniques
worth carrying forward once confirmed:
- **"What I wore / where I went / what I got"** — a 3-beat recap structure
  (outfit shot → location shot → food/product flat-lay, each with a plain
  lowercase caption). Concrete, reusable format for day-out content.
- **Overhead/flat-lay (OS) shots** for food and lifestyle moments —
  reinforces the existing OS shorthand in the shot-list framework.
- **Object-label callout graphics** — bounding-box-style call-outs with
  connector lines pointing at specific outfit/food items in a frame or
  thumbnail (seen on both an outfit breakdown and a Ghana thumbnail).
- **Route/connector annotation lines** on thumbnails, linking a title to
  specific food items shown (seen on a Hà Nội thumbnail).
- **Google Maps / ratings-screenshot inserts** as a visual element —
  documents the actual restaurant/location, fits the documentarian
  specificity ethos well.
- **Nested camera-viewfinder framing** (content shown inside a retro digital
  camera's screen) — same family as the camcorder-viewfinder motif already
  noted in the Yale Jeannette graphics reference in `../STYLE_GUIDE.md`.
- **Photo-booth filmstrip collage** as a recap/transition layout.
- Thumbnail convention observed across many sampled travel channels: bold
  script or bold sans location-name title + a 2–4 photo collage (food,
  place, one personality/portrait shot).

**Status as of 2026-09-14:** everything in the list above is now confirmed
as usable layout vocabulary for this brand — see § Editing Feel.

**Flagged, not adopted:** the board also leans heavily on glossy 3D
Canva stickers/embellishments (balloon letters, enamel-pin-style icons).
That's a live open question, not a decision — ask before using decorative
sticker elements on any @blkgrlcotoo asset, since nothing like that is
locked in yet.

**Caution:** this board samples many other creators' actual videos/thumbnails.
Extract technique only (framing, structure, graphic device) — never copy a
specific creator's thumbnail or video 1:1.

## Color Grading

**Two-step pipeline — don't conflate the steps:**
1. Technical conversion (cross-brand default, `../STYLE_GUIDE.md`): DJI
   Osmo Pocket 3 D-Log M footage → "DJI OSMO Pocket 3 D-Log M to Rec.709"
   LUT. This gets footage to a clean Rec.709 starting point.
2. **Creative grade (confirmed 2026-09-11, @blkgrlcotoo-specific):** one of
   five Rec.709→Rec.709 film-emulation LUTs, applied on top of step 1's
   output — not a replacement for it. Files stored at
   `assets/luts/blkgrlcotoo/` (DaVinci Resolve-generated, 65-point 3D LUTs):

   | File | Reads as (Kodak Vision3-style naming) |
   |---|---|
   | `709to709_250D_x65_Clean_White.cube` | 250D — daylight-balanced, no grain |
   | `709to709_500T_x65_Clean_White.cube` | 500T — tungsten-balanced (low light/interior), no grain |
   | `709to709_500T_x65_Film_White.cube` | 500T — tungsten-balanced, with film grain/halation |
   | `709to709_160T_x65_Clean_White.cube` | 160T — tungsten-balanced (brighter tungsten), no grain |
   | `709to709_160T_x65_Film_White.cube` | 160T — tungsten-balanced, with film grain/halation |

   **Confirmed 2026-09-11: it's a lighting-condition kit — pick per
   shoot, not one universal file.** Selection logic:
   - Daylight/outdoor → `250D`
   - Interior/low light, tungsten → `500T`
   - Interior, brighter tungsten → `160T`

   The condition→ISO mapping above follows standard film-stock convention
   (matching Kodak Vision3 naming) — confirmed that it's a condition-based
   kit, but the specific per-condition assignment is still my inference,
   not verified line-by-line. **Confirmed 2026-09-11: Clean vs. Film
   (grain) is a per-shoot creative call, not a standing preference** — pick
   whichever suits that video, same as the ISO/balance choice.

## Editing Feel

**Confirmed 2026-09-14 — the governing creative direction for this
brand's edits.** Compiled as a ready-to-paste agent prompt at
`../../agents/BLKGRLCOTOO_EDITOR_PROMPT.md`; refresh that file whenever
anything here changes.

**Thesis:** a @blkgrlcotoo edit is a *video postcard sent to a close
friend*, not a travel vlog, tourism spot, influencer montage, or polished
cinematic travel ad. The viewer should finish it thinking "I'm booking
that flight, and this is my itinerary" — and, more importantly, "I was
supposed to be there."

- **Personal over perfect.** Slight camera movement, handheld motion,
  quick moments and unexpected framing stay in when they make the video
  feel authentic. Imperfection is the point; polish is the failure mode.
- **Mixed media, not just footage.** Photographs, screenshots, maps,
  menus, tickets/receipts, location info and close-up details are
  first-class material alongside video — the diary feeling comes from
  mixing forms of visual information, not from better clips.
- **Memory-flip pacing.** Not "beautiful shot → beautiful shot → beautiful
  shot." The rhythm runs moment → detail → environment → person →
  unexpected detail → photo → movement → location → atmosphere, with shot
  lengths varying naturally: quicker where the destination's energy calls
  for it, slower where a place needs absorbing. Few transition effects —
  cuts, movement, sound and visual relationships carry most transitions.
- **Emotional order, not chronological order.** Organize around the story
  of the day, answering: where am I, what am I doing, what caught my
  attention, what did this place feel like, what would make my friend want
  to come here. Practical info lands naturally where it exists; it never
  becomes a guide unless asked. **This does not relax the documentarian
  transition rule** — reorder the day freely, but the movement between two
  adjacent talking moments still has to be on screen.
- **Annotation-scale typography.** Text reads like notes written into a
  travel journal — destination, date, neighborhood, restaurant, time,
  coordinates, short observations, tiny captions, itinerary details. No
  giant YouTube-style titles, generic travel graphics, heavy text
  animation, or corporate typography.
- **Collage that breathes.** Layered scrapbook pages (photos, video
  frames, screenshots, maps, small labels, location markers, tickets,
  menus, decorative marks) alternating with full-screen immersive footage
  — not every frame a collage.
- **Natural sound as storytelling.** Music never erases the experience of
  being there: footsteps, airport announcements, traffic, restaurant
  noise, conversation, ocean, trains, doors, laughter, street ambience get
  preserved and used. The viewer should periodically feel like they're
  standing beside her. (Studio rules still apply on top: music is chosen
  before shooting; any graphic/transition effect used carries a sound —
  an argument for fewer effects, not silent ones.)
- **Grade for the place, not the preset.** Natural skin tones, the
  destination still looking like itself, a filmic/tactile/slightly
  nostalgic image. Explicitly avoid excessive saturation, crushed blacks,
  plastic skin, extreme HDR, heavy teal/orange, and "travel influencer"
  presets. This is the intent *behind* the five-LUT kit above, not a
  licence to skip the two-step pipeline.
- **References inform, never get copied.** Reference images/videos are the
  primary source for composition, graphic treatment, collage language,
  pacing, typography behavior and texture — extract the principle,
  translate it into an original @blkgrlcotoo language, never reproduce a
  specific creator's work.

**Promoted by this direction:** the Pinterest-board techniques listed
earlier on this page —
3-beat "what I wore / where I went / what I got," overhead flat-lays,
object-label callouts, Google Maps/ratings-screenshot inserts, photo-booth
filmstrip collage, nested camera-viewfinder framing — are now confirmed as
usable layouts for this brand rather than candidate direction. The glossy
3D Canva sticker/embellishment direction stays **flagged and unadopted**;
it isn't mentioned in this direction either way.

**Open item:** the journal-annotation look implies a handwritten hand, but
no handwritten font is licensed to @blkgrlcotoo — `Editor's Hand` is
assigned to @blkgrlco and `Hello Scratchy` is unassigned (see
`../FONT_LIBRARY.md`). Until that's decided, annotation text is set in TAN
Memories / Perfectly Nineties, small and lowercase, with the journal
feeling carried by scale, placement and restraint.

## Editorial Frameworks That Apply Here
- **Wide → Medium → Close** — standard scene-establishing tool for a new
  location.
- **Flow Cut** — works well for transit/movement footage.
- From Graphics/SFX reference (Yale Jeannette): stated fit for the
  fast-cut, graphic-heavy pop-up/SFX style, alongside @blkgrlco (opposite
  of the podcast's documentarian rule). Nothing locked in yet.

## SEO / Hashtags / Titles / Descriptions
- Core terms: destination name + genre terms (solo travel, travel vlog,
  [country/city] travel, budget travel, Black traveler) — pull specific
  neighborhoods/landmarks/experiences from actual footage, not generic
  "travel guide" language.
- Series names to use exactly: "Young & Outside in [Location]," "SCENT
  PASSPORT."
- Hashtag tiers: broad (#traveltiktok) / niche (#blackgirltravel) / brand
  (#blkgrlcotoo, #youngandoutsidein[location], #scentpassport).
  **Never reuse retired hashtags:** #stamped, #fuckitbookit,
  #younghotandoutside.
- Hook patterns (Idea Bank): compliment-getter recommendation, value/dupe
  comparison, fixable-mistake tip, mood-visual + specific detail.
- Titles: front-load the searchable term (location/topic/series name);
  match the exact current series name (it's changed more than once); don't
  duplicate the title phrase on the thumbnail.

## Connected Tools
- **vidIQ is authorized against this channel's YouTube** (1 subscriber, 0
  videos as of last check — brand new, no content yet). No Instagram
  connected on vidIQ. Its research tools (keyword research, outliers,
  trend data, competitor tracking) are usable for general/competitor
  research, but own-channel analytics won't reflect real content until
  something is published.
- **Metricool connected as of 2026-09-10** (id 6918875) — Instagram,
  TikTok, YouTube. Brand new: no published content found on any of those
  three networks as of a 2026-09-11 check.

## Growth/Monetization Reference — Applicability
The studio's monetization reference material is framed around @blkgrlco
specifically (the channel with real Metricool-tracked history) and hasn't
been actioned here. The platform-strategy note (YouTube > Instagram > TikTok
for monetization value) and the sustainability philosophy (don't change
what you talk about, evolve how you talk about it) would apply brand-wide
if monetization becomes relevant later — see `../../growth/MONETIZATION_STRATEGY.md`
for why that's not the current studio priority regardless of brand.
