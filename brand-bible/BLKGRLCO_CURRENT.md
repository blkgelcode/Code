# @blkgrlco — Current Rules (compiled)

Everything currently locked for **@blkgrlco**, in one place. Compiled
2026-11-18 (Road to 26.2 added the same day) from `brands/blkgrlco.md`, `STYLE_GUIDE.md`,
`SCRIPTWRITING_GUIDE.md`, `FONT_LIBRARY.md`, `SOUND_LIBRARY.md`,
`CREATIVE_MEMORY.md`, `../growth/SEO_GUIDE.md`,
`../growth/CONTENT_STRATEGY.md` and `../agents/EDITOR_AGENT_PROMPT.md`.
Those files stay the source of truth: when a rule changes there, recompile
this file rather than editing it by hand. Anything not locked is in the
last section, as a question, never as a rule.

---

## 1. Who it is

| | |
|---|---|
| Channel | **@blkgrlco**, BLKGRLCO Studios' flagship (personal development). Creator: Omnia Koumi |
| Mission | Celebrate the resilience, creativity and self-discovery of Black women; empower intentional living through community, mental wellness and a balanced life |
| Motto | **Be Free, Be Kind, Be Well.** |
| Core values | Resilience, Intentional Living, Self-Care, Creativity, Community Connection, Kindness, Authenticity |
| Framework | **HOTTER, HEALTHIER, HAPPIER (HHH).** Never "The Becoming" (retired) |
| Audience | Black women, 25–40, prioritizing personal growth, intentional living, self-care and exploration; creative professionals, entrepreneurs, community-focused |
| Goal | Consistency, storytelling craft and content she's proud of. **Not** subs, views or monetization (target set and scrapped Sept 2026) |

Sister channels: @blkgrlcotakesoff (travel, formerly @blkgrlcotoo) and the
podcast *I Wish Somebody Had Told Me*. Never apply their rules here by
default. @blkgrlco's HAPPY lane covers some travel; the dedicated travel
channel is separate.

## 2. What gets made, and when

**Lanes (daily shorts):**

| Day | Lane | Covers |
|---|---|---|
| Mon / Thu | **HOT** | Confidence, beauty |
| Tue / Fri | **HEALTHY** | Fitness, nutrition (Ladder lifting program, CookUnity, skincare cycling) |
| Wed / Sat | **HAPPY** | Travel, relationships, lifestyle |
| Sun | **Long-form vlog** | The week's recap footage plus new Sunday-only footage |

**Her real week:** full-time job Mon–Fri 3pm–12am. Weekday mornings are
opportunistic capture only. Saturday is batch filming. Sunday is edit,
upload, reflect, plan.

**Series:**
- **90-Day HHH Run.** Premise: *"I'm hot. I'm healthy. I'm happy — or I
  will be in 90 days."* Reference cut: "Day1of90"; later days match its
  cut and pacing. **Locked CTA: "make your own Pin Board."** "Day N of 90"
  numbers have drifted before: check the video's dashboard record first.
- **Road to 26.2.** The **next challenge series**, after the 90-Day HHH
  Run ends (around early December 2026): marathon training toward 26.2
  miles, HEALTHY lane, race as the finale. Race, dates, day-count format
  and CTA not given yet.
- **"Who Is She?"** Four pillars: Mental, Physical, Spiritual, Emotional.
  Device: dream-state future-self framing.
- **Weekly Vlogs.** HOT / HEALTHY / HAPPY segments rotate weekly.

**Before filming:** decide one central topic, list the shots for the video
*and* the thumbnail, and pick the music. Music is chosen before shooting,
not added in post.

Her **2027 vision board** is her own planning, where the challenges come
from, not content. "Vision board" is fine to say for 2027; "NOT A VISION
BOARD" belonged to the 90-Day HHH Run only.

## 3. Voice and scripts

- Empowering, authentic, aspirational. Warm, relatable, inspiring:
  storytelling, connection, reflection.
- **Concrete and countable**: "3 workouts this week", not "getting
  healthier". Name the specific activity, never the vague vibe. Missing
  detail = a flagged blank, never an invented stat.
- No filler or creator-speak: no "hey guys, welcome back", "you won't
  believe", "this changed my life", "must watch".
- Real, specific personal detail stays in. Don't sanitize it.
- **Daily vlogs open on "good morning"**, and that sentence finishes before
  any cut.
- **Locked opener style:** declarative present tense ("I'm hot... so I
  need to beautymaxx"). Echo it where it fits; don't force it.
- Open mid-action. End cold. No filler sign-off, except **"bye bye"**,
  which always stays.
- CTA is natural and tied to what the viewer just got.
- Arcs with a real finale: **Challenge → Exploration → Result →
  Realization → Empower Audience.**
- **Hook patterns:** Identity Call, Contrarian Strike, Open Loop,
  Confession, Results First, Mistake Warning, Direct Question,
  POV/Relatable.

## 4. Editing

**Documentarian rule:** open mid-action, end cold, name the specific
activity.
- Keep pauses and sighs where they carry emotional truth. **Explainer
  exception:** pure talking-head or explainer segments get all dead air
  cut.
- "lululu" / "la, la, la" on camera = her flub marker. Cut that take.
- Every montage clip moves the story forward. Progression montages build in
  escalating steps, intercut with movement.
- Never cut from talking in one place to talking in another. Cut the real
  transition (walking out, car, arriving). Test: *could you tell she moved
  just by listening?*

**Daily Vlog Editing Standard (every edit):**
- Open on "good morning"; let it finish.
- Check the head of every clip: she often starts talking 1–2s in.
- Cut all dead air, ums, false starts and repeated lines (keep one clean
  take).
- Every cut lands on a body movement, never on her repositioning the
  camera.
- Show a routine's real steps in order (open bottle → pour → drink → meds),
  not a scene-detection montage. Routine shots hold **2.5–3.5s**.
- Keep personality moments (brain freeze, complaining through a workout,
  reactions).
- **Label card on every scene change:** Arial Rounded Bold ~170pt,
  `#A8B118` (RGB 168,177,24), lowercase, centered on a 1920×1080
  transparent canvas → `assets/cards/l_<name>.png`.
- **Always deliver a Shorts cut under 3:00** alongside the master.
- Skip corrupt or accidental-trigger clips; report which.
- Run `_tools/preflight.py` before calling any master finished.

**Shorts frameworks:** Real-Time Timestamp Cutdown (rapid micro-cuts
stamped with real clock time).

**Cuts in use:** Jump Cut (same angle, trims dead air, on music beats),
Action Cut (hidden in motion), J-Cut / L-Cut (audio leads or trails the
picture), Match Cut, Cutting on Action, Cross Cutting, Fade, Dissolve.
Plan cuts before shooting.

**Shot codes:** EW establishing wide · WS wide · MS medium · CU close-up ·
AM action/movement · OS overhead · ECU extreme close-up · OTS
over-the-shoulder. Scene order: establishing → wide action → medium →
close-up → over-the-shoulder.

## 5. Picture

| | |
|---|---|
| Camera | DJI Osmo Pocket 3, D-Log M |
| Step 1: conversion | DJI's "DJI OSMO Pocket 3 D-Log M to Rec.709" LUT, `assets/luts/dji-pocket3/`. Ignore the file's bt709 tag (DJI mis-tags it). Never put a creative look here |
| Step 2: creative grade | **The Everyday LUT** (Nicholas Di Giugno / ToldbyNick), `assets/luts/blkgrlco/`. Too dark: raise exposure *before* the conversion. Too strong: lower intensity. Not enough: stack a second copy |
| Order | Base correction → conversion → The Everyday LUT → finishing, black levels last → *then* reframe / center her face in CapCut |
| Frame | True vertical **1080×1920**. Never pillarboxed landscape |
| Skin | Natural, never distorted for style |
| Editor | CapCut |
| Broken footage | Round-trip through a Canva design, export as MP4 |
| Storage | Samsung T7, `project hhh` folder, one subfolder per video. Google Drive is backup only |

No exposure, contrast or saturation targets are locked beyond the LUTs.

## 6. Sound (Arthur's "Cut Theory")

1. **Edit to the beat.** Mark beats, cut on the markers.
2. **Duck with a de-esser**, not a volume dip: carve a frequency pocket in
   the music for her voice.
3. **Vary repeated SFX.** Layer a low hit, mid whoosh and high texture;
   never stack the same sound.

**No graphic or transition is silent:** pop/click/tap on every text
pop-up, camera shutter on snapshot cuts and freeze-frames, paper tear on
wipes, soft whoosh on fast slides and zooms, mouse click on mock-UI.

Licensed tracks and SFX (Epidemic Sound) for this channel: none confirmed
yet.

## 7. Look: logo, type, palette

- **Logo:** modern, bold, lowercase: `blkgrlco.`
- **Aesthetic:** clean, minimal, contemporary, soft organic shapes.

| Font | Use |
|---|---|
| **Advercase** | Thumbnail headline. The only thumbnail headline font |
| **Editor's Note** | Secondary/supporting thumbnail text, beneath the Advercase headline |
| **Editor's Hand** | Handwritten captions and quotes only. Never thumbnails |
| Arial Rounded Bold | Label cards only (see §4) |

Font files: `assets/fonts/blkgrlco/`.

**Palette (locked):**

| Hex | Color |
|---|---|
| `#F0DAC2` | Warm cream / pale peach |
| `#B68A71` | Warm tan |
| `#B4AD7F` | Sage/olive tan |
| `#636407` | Dark moss olive |
| `#A8B118` | Olive-chartreuse (= the label-card color) |
| `#EBB9BA` | Blush pink |
| `#8C0532` | Deep berry / wine |
| `#49001B` | Oxblood maroon |
| `#2E1500` | Near-black espresso brown |

## 8. Thumbnails

1. Research what's working in the niche right now; check accuracy if it's
   about a real place, event or thing.
2. Study her reference examples and name the mechanics being pulled before
   using them.
3. Match the locked look above. A trend that conflicts gets flagged, not
   applied.
4. Face centered and readable small; every element earns its place; 5
   words or fewer. **Never repeat the title's phrase** — split the hook.
5. YouTube 1280×720; TikTok/IG covers 1080×1920. Check at phone size.

**Never AI-generated**, ever. Plan the thumbnail shots before filming.

## 9. Titles, descriptions, hashtags

- **Titles:** front-load the searchable term or series name; exact series
  names; specific and viewer-focused.
- **Descriptions:** 1–2 sentences saying what the video actually is, using
  the core terms naturally → the real specifics → the locked CTA where it
  applies. Her voice, short, no "in this video we will be discussing".
- **Core terms:** hot healthy happy, glow up, confidence, beauty, fitness,
  nutrition, self-improvement, accountability.
- **Hashtags, three tiers per post:** broad **#glowup** · niche
  **#90dayplan** · brand **#blkgrlco**, **#hothealthyhappy**.
- Packaging earns the click, retention earns the push. A/B test title and
  cover rather than shipping the first draft; change one variable at a
  time.

## 10. Never use

| Retired | Use instead |
|---|---|
| "The Becoming" | HOTTER, HEALTHIER, HAPPIER (HHH) |
| "comment your own rule" (CTA) | "make your own Pin Board" |
| AI-generated thumbnails | Her own frames and design |
| Notion as the system of record | The BLKGRLCO Studios dashboard |

## 11. Tools, records, approval

- **System of record:** the BLKGRLCO Studios dashboard
  (https://claude.ai/artifact/UZu9ZMKxs7FyTR9UMHxBKn), one record per piece
  of content. Ideas and ticked titles come in from BLKGRLCO Bin
  (`apps/blkgrlco-bin/`) via `bin-export.json`.
- **Publishing:** **Metricool only** (Instagram, Pinterest, TikTok,
  YouTube). No Plann, no Clem. This is the channel with real posting
  history.
- **Nothing auto-publishes.** Every script, edit, caption, thumbnail and
  scheduled post goes to Omnia for approval first.
- **Production team:** `/produce-video <idea>` runs the ten agents in
  `.claude/agents/` (research → brief → script + packaging → edit
  blueprint → grade, sound, repurposing → QC), stopping for her approval
  at each gate.

## 12. Structural references (technique only, never imitation)

heynatalibrown (diary pacing, mundane-to-striking shots; HOT/HAPPY) ·
Azhai Boggs (framing; wardrobe and light as brand assets; HOT) · Jayla
Henry (diary narration over ordinary footage, no tutorial tone; HEALTHY) ·
Eni (humor and honesty in small moments; HAPPY).

## Not locked — ask, don't assume

- Road to 26.2: which marathon, race date, start date, day-count format,
  CTA, and how it fits the daily lane rotation.

- "Aurelia Gray" / "Rachel McDermott" as references: real handles not
  given.
- Exposure, contrast and saturation targets beyond the LUTs.
- Licensed music and SFX picks.
- The Yale Jeannette pop-up / notification-card / cutout graphics pack:
  a technique reference, nothing built. If built, it uses this palette.
- Quote-card template (bold black sans headline + small-caps body on
  cream, "Girl, be too much."): candidate for carousels, not built.
- Glow-up and Creativity moodboards: reference imagery, not a locked look.
  "You are way too creative for a 9 to 5" is flagged as a possible
  personal-story hook.
