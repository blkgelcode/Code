# Creative Memory

The running record that makes this system get smarter instead of repeating
itself. Updated whenever: an example is analyzed, an experiment concludes,
or you give a correction.

**Rule:** an entry here becomes a *permanent* rule (promoted into
`BRAND_BIBLE.md` / `STYLE_GUIDE.md` / `SCRIPTWRITING_GUIDE.md`) only when you
approve it explicitly or it's confirmed across ≥2–3 independent examples.
Otherwise it stays logged here as project-specific context.

**Standing workflow rule (confirmed 2026-09-11):** whenever a new
editing-relevant rule gets locked anywhere in `brand-bible/` (technical
specs, per-brand editing standards, fonts, palettes, color grading, sound
design, thumbnail workflow), regenerate `agents/EDITOR_AGENT_PROMPT.md`
from the updated source docs and re-send it — don't wait to be asked.
Non-editing rules (SEO, monetization, analytics, general strategy) don't
need this, since that prompt is scoped to editing only.

---

## Source documents ingested
| Date | Document | Status |
|---|---|---|
| 2026-09-11 | `source/blkgrlco-editing-standing-rules.md` (BLKGRLCO Studios editing standing rules) | Merged as approved rules — now scoped to `brand-bible/brands/blkgrlco.md` (daily-vlog editing standard) and `STYLE_GUIDE.md` (cross-brand technical specs). Superseded the earlier single-brand model of this repo — BLKGRLCO Studios is three brands, not one; see below. |
| 2026-09-11 | `source/blkgrlco-seo-hashtags-descriptions.md`, `source/blkgrlco-studio-overview.md`, `source/blkgrlcotoo-brand.md`, `source/blkgrlco-hub-project-instructions.md`, `source/uglyinbetween-brand.md`, `source/blkgrlco-brand-identity-updated.md` (PDF, text-extracted) | **Major restructure.** Revealed BLKGRLCO Studios (creator: Omnia Koumi) spans three distinct brands — @blkgrlco (personal dev), @blkgrlcotoo (travel), @uglyinbetween (podcast) — each with its own voice/visuals/audience/production rules. Rebuilt `BRAND_BIBLE.md` as the studio-level doc, added `brands/blkgrlco.md`, `brands/blkgrlcotoo.md`, `brands/uglyinbetween.md`, and rewrote `STYLE_GUIDE.md`, `SCRIPTWRITING_GUIDE.md`, `growth/SEO_GUIDE.md`, `growth/CONTENT_STRATEGY.md`, `growth/ANALYTICS_SYSTEM.md`, `growth/MONETIZATION_STRATEGY.md` accordingly. Also **superseded the earlier scaffold's monetization framing** — the studio explicitly de-prioritized monetization in favor of consistency/craft (see below). |
| 2026-09-11 | Pinterest board screenshots, "blkgrlcotoo visual identity" (5 images, not text) | **Medium confidence** — inspiration/technique board of other creators' work, not her own footage. Logged candidate techniques into `brands/blkgrlcotoo.md` (3-beat "what I wore/where I went/what I got" recap structure, overhead flat-lays, object-label callout graphics, Google Maps inserts, camera-viewfinder framing, photo-booth filmstrip collage) — none locked as rules. Flagged the sticker/glossy-3D-Canva-element direction as an open question rather than adopting it. |
| 2026-09-11 | 5 images (real Pilates-workout Story screenshot, glow-up moodboard "by BLKGRLCO", Creativity-pillar moodboard, quote card, glam motion-blur portrait) — **confirmed @blkgrlco visual identity** | Logged into `brands/blkgrlco.md`: the Pilates screenshot as a live example of the specificity rule (Medium-High confidence, it's real content); the glow-up/Creativity moodboards and quote-card as Medium-confidence reference material, not locked. Noted "too creative for a 9 to 5" as a potential personal-story hook worth surfacing later. Explicitly did not conflate the Story caption style seen here with the locked daily-vlog label-card spec. |
| 2026-09-11 | 3 images, labeled "ugly in between visual identity" — two-host warm/colorful studio setups | **Flagged as a conflict rather than merged** (per the standing rule in `brands/uglyinbetween.md`: flag a trending-convention conflict, don't quietly override). All three showed a two-host conversational format, warm/colorful palette, and a Y2K-nostalgia set — directly conflicting with the locked solo, B&W, aubergine/terracotta identity. Asked via AskUserQuestion; answer: **studio/setup inspo only**. Adopted: the warm neutral physical set/lighting reference from one image (bean bags, wood tables, soft light) as recording-space inspiration only — final visual treatment stays locked B&W. **Explicitly not adopted:** the two-host format, the Y2K nostalgia wall, the candid handwritten-marker promo-graphic style, and the one-word episode-title convention ("FEAR") seen in these images — none of these override the locked solo format/identity/naming convention. |
| 2026-09-15 | `source/blkgrlco-yap-batch-01.md` (Yap batch 01 filming sheet) | Adopted as a new @blkgrlco format — one-take, no-methods-no-tips talking-to-camera shorts for TikTok/IG. Written into `../growth/CONTENT_STRATEGY.md` with the batch-01 hook list. Also carries a sharper audience definition (tried the methods, couldn't stick) than the channel-wide demographic. Three conflicts with locked rules flagged, not resolved: Poppins captions, the `/Volumes/T7/@blkgrlco/yaps/` path, and phone-shot footage vs. the Pocket 3 D-Log grade pipeline. |

## Corrections log
*(mistake → correction → date. Referenced before every new piece of content so it isn't repeated.)*

**2026-09-11 — feedback on a published YouTube vlog:**

1. **Mistake:** cutting straight from talking in one location to talking in
   another (house → gym) with no footage of the actual transition — reads
   as disconnected clips, not a story.
   **Correction:** always shoot/cut in transitional footage between
   locations/segments (walking out, car, driving, arriving, etc.). Test:
   *if you closed your eyes and only listened, could you tell a transition
   was happening?* If not, the transition is missing, not just under-edited.
2. **Mistake:** none — confirms existing rule. Not every vlog needs a full
   intro, but it does need a short preview/"trailer" up front (this system
   already has this as the "3–4 clip coming up preview after the cold
   open" rule in `STYLE_GUIDE.md` — same concept, her language for it is
   "trailer of a movie," not "collage").
3. **Mistake:** using AI-generated thumbnails — viewer feedback: "you can
   tell AI made it," personally doesn't click AI thumbnails even when they
   don't look terrible.
   **Correction:** no AI-generated thumbnails. Pick one font, stick to it,
   format consistently; allow the format to evolve deliberately over time,
   not per-video.
4. **Mistake:** filming without planning the vlog's focus first — result is
   a more chaotic, all-over-the-place video, and this reads to viewers as
   unfocused "yapping."
   **Correction:** before filming, decide the single central topic and list
   the shots needed for both the video and the thumbnail, so nothing gets
   missed on the day. Confirmed audience insight: viewers increasingly favor
   vlogs built around one central topic over broad, unfocused ones.

**Noted (not yet a confirmed rule, her own words: "this is a different type
of vlog"):** for voiceover-driven vlogs, she plans the shot list ahead but
doesn't always script the voiceover beforehand — writes it after, to match
what was actually shot; deliberately leaves some stretches un-narrated
(ambiance/ASMR) rather than voicing over everything. Medium confidence —
watch for this recurring before promoting to `SCRIPTWRITING_GUIDE.md`.

## Retired — never use again

| Retired name/term | Replaced by | Brand |
|---|---|---|
| "The Becoming" | HOTTER, HEALTHIER, HAPPIER (HHH) | @blkgrlco |
| "Young Hot & Outside" | "Young & Outside in [Location]" | @blkgrlcotoo |
| "Fuck It Book It" / "STAMPED" | "Young & Outside in [Location]" (via "Young Hot & Outside") | @blkgrlcotoo |
| "comment your own rule" (CTA) | "make your own Pin Board" | @blkgrlco (90-Day HHH Run) |
| #stamped, #fuckitbookit, #younghotandoutside (hashtags) | current brand/series hashtags | @blkgrlcotoo |

## Scrapped decisions (kept for context — do not resurrect without her explicit ask)

- **"Monetized on YouTube by Feb 2027"** — set 2026-09, scrapped the same
  day after seeing the real gap (120 subs / 28 min watch time vs. 1,000
  subs / 8,000 watch-hours). Replaced by: consistency, craft, content she
  loves is the actual goal. See `BRAND_BIBLE.md` §9.

## Confirmed brand LUTs

| Brand | Files | Notes |
|---|---|---|
| @blkgrlcotoo | 5 files, `brands/assets/luts/blkgrlcotoo/` — 250D/500T/160T × Clean/Film | 2026-09-11. Applied *after* the cross-brand D-Log M→Rec.709 conversion, not instead of it. **Confirmed: lighting-condition kit, pick per shoot** — 250D daylight, 500T/160T tungsten interior. **Clean vs. Film (grain) is a per-shoot creative call**, not a standing preference — fully resolved, no open items left on this LUT kit. |
| @blkgrlco | "The Everyday LUT" (Nicholas Di Giugno / ToldbyNick), `brands/assets/luts/blkgrlco/` | 2026-09-11, stated as "the secondary [pass]." Single-file creative grade, applied after the D-Log M→Rec.709 conversion — same two-step structure as @blkgrlcotoo. Fully resolved, no selection logic needed (one file, not a kit). |

## Confirmed brand fonts

| Brand | Thumbnail font | Locked |
|---|---|---|
| @blkgrlco | **Advercase** (thumbnail headline); **Editor's Note** (secondary/supporting thumbnail text — mirrors the @blkgrlcotoo split); **Editor's Hand** (handwritten captions/quotes only) | 2026-09-11, confirmed directly. Fully resolved — no open items on this brand's typography. |
| @blkgrlcotoo | **TAN Memories** (thumbnail headline font) + **Perfectly Nineties** (secondary/accent), confirmed 2026-09-11 | Fully resolved — no open items on this brand's typography. |
| @uglyinbetween | Garamond Italic (headlines) / Helvetica Neue Light (body); **thumbnail headline role superseded 2026-09-11 by Eighties Comeback** (stated directly as "for uglyinbetween thumbnails") | Garamond/Helvetica Neue pre-existing, locked. Eighties Comeback replaces the thumbnail-headline role specifically — flagged as a deliberate change to a previously locked font, not silently swapped. |

## Confirmed brand palettes

| Brand | Palette | Locked |
|---|---|---|
| @blkgrlcotoo | `#284376` navy, `#E58E47` marigold, `#D9D1C7` sand, `#CA5278` raspberry, `#6177A8` periwinkle | 2026-09-11, via coolors.co link — explicit, high confidence, supersedes the earlier "no palette locked" placeholder. |
| @blkgrlco | `#F0DAC2` cream, `#B68A71` tan, `#B4AD7F` sage-tan, `#636407` moss olive, `#A8B118` olive-chartreuse, `#EBB9BA` blush, `#8C0532` wine, `#49001B` oxblood, `#2E1500` espresso | 2026-09-11, confirmed directly (color-generator screenshot) — supersedes the PDF's named colors and the earlier proposed-hex guesses. `#A8B118` matches the already-locked label-card color exactly. |
| @uglyinbetween | `#3A2E39` aubergine, `#DDBEA9` terracotta | Pre-existing, locked. |

## Source documents ingested (continued)
| Date | Document | Status |
|---|---|---|
| 2026-09-11 | Transcript of TikTok clip "v15044gf0000d8slninog65gq077jn50" — "Cut Theory Part 3" (sound design) by creator Arthur | Resolves one of the 5 originally-unwatchable TikTok clips flagged earlier. Applied directly into `STYLE_GUIDE.md` (new Sound Design Toolkit section) and `SOUND_LIBRARY.md` (SFX-as-a-set rule, music editing technique notes). The other 4 clips from that original batch remain unresolved. |
| 2026-09-11 | Pinterest "BeautyPlus moodboard" — graphic element library screenshots (digicam frames, webcore/iOS UI, outer frame objects, fruit cutouts, paper cutouts) | **Medium confidence** — stated as "elements I want on hand" (real intent, not passive inspiration), but not yet applied to specific content. Logged into `STYLE_GUIDE.md`'s Graphics/Pop-Up/SFX Reference section. Connects to the existing camcorder-viewfinder and mock-UI SFX rules, and adds more evidence toward the still-open sticker/decorative-element question for @blkgrlcotoo. |

## Notion Content Calendar cross-referenced with Metricool (2026-09-11)

Live check: Metricool now shows all three brands connected (as of
2026-09-10, previously only @blkgrlco was documented). Found 4 published
TikTok posts on @blkgrlco, zero published content yet on @blkgrlcotoo or
@uglyinbetween across any network.

Updated directly in Notion (not just documented here):
- "Hot. Healthy. Happy. My Actual 90-Day Plan" → Status: Published,
  Publish Date corrected to 2026-09-06 (was planned for 09-05).
- "Day 1 of 90: Hot Healthy Happy Challenge (Weekly Vlog 1)" → Status:
  Published, Publish Date corrected to 2026-09-08 (was planned for 09-06).

**Not added to the calendar, flagged instead:** 2 published TikToks with no
matching calendar entry (a "Day 2 of 90" post and a skincare/immunity-
juice/evening-check-in short, both 2026-09-08/09) — likely daily-shorts
content the calendar doesn't track at that granularity. Didn't add them as
new rows without asking, since that changes what the calendar is scoped to
track.

**Also unconfirmed:** whether the 6 other Aug 31–Sept 6 calendar items
(Launch Photos, Podcast Intro Video, Episode 1 for @uglyinbetween; Glow Up
video for @blkgrlco) have actually gone out — no matching published content
found on TikTok/Instagram/YouTube for any of them, consistent with
@uglyinbetween having zero live content, but the Glow Up video's status
wasn't otherwise resolved.

## Notion reorganization pass (2026-09-11)

Explored the full Studios Hub (previously only partially captured in this
repo — the Hub page has a large, already-sophisticated production
toolkit: shift-aware Plan→Film→Edit→Upload→Reflect scheduling, 10+
editorial reference frameworks, an HTML toolkit of 6 external Claude
Artifacts, Feed Preview galleries, and in-progress scheduling-tool setup
for Clem + Metricool + Plann). This is not a system that needed a ground-up
rebuild — found and fixed specific gaps instead:

**Fixed directly in Notion:**
- Created 9 missing Content Calendar rows for @uglyinbetween Season 1
  Episodes 2–10 — the Idea Bank had these fully titled/sequenced/noted
  with Status "In Calendar," but the Content Calendar itself only had a
  generic "Episode 1" row. Used real titles/hook patterns/notes from Idea
  Bank; left Publish Date blank since her own notes say "exact date TBD"
  — not inventing a schedule for her.
- Flagged (not deleted, no delete tool available) a completely empty
  stray Content Calendar row.
- Flagged a likely-stale duplicate in Idea Bank: a generic "Episode 2"
  entry that predates the resolved "Burden of the First Born Girl" title.

**Resolved 2026-09-11 (see below):** the three-way Plann/Clem/Metricool
scheduling question — Omnia confirmed Metricool as the sole publishing
tool going forward.

**Not touched, flagged for her decision:**
- The existing "Episode 1" Content Calendar row's Name doesn't match its
  resolved title ("Starting Scaries — Permission To Not Have It Figured
  Out") — left as-is rather than renaming unilaterally.
- No relation property exists linking Idea Bank ↔ Content Calendar (would
  prevent this exact gap from recurring) — flagged as a suggestion; adding
  a new database property needs a schema-edit tool this session doesn't
  have loaded.

## @blkgrlco 90-Day HHH Run — Content Calendar backfill + placeholders (2026-09-11)

Omnia confirmed she'll be posting 90 daily vertical reels/shorts for
@blkgrlco's "Hot. Healthy. Happy." 90-Day Run (project hhh — one per day,
TikTok, Content Type "Short-Form Cutdown"). Instruction: add the
already-published orphan videos to the Content Calendar, and create a page
for every future/upcoming daily short.

**Added to Content Calendar (published, real Metricool data):**
- "Day 2 of 90..." — published 2026-09-08, caption/hashtags/URL pulled from
  Metricool, Status Published.
- "Day 3 of 90: Morning Skincare..." — published 2026-09-09, same treatment.

**Day-numbering ambiguity surfaced and resolved via AskUserQuestion:**
Her Weekly Vlog day-labels (8, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78) match
a straight elapsed-day count from Day 1 = 2026-09-06. But the finale is
separately labeled "Day 90 of 90" despite landing on elapsed Day 85 by
strict count, and her own "Day 2" TikTok caption (published Sept 8, which
is elapsed Day 3) already runs a day behind strict count by Day 2–3 — i.e.
her informal day-counting has its own internal drift, not fully consistent
with a fixed formula. **Approved approach: straight daily count** (Day N =
2026-09-06 + N−1, no skips) for dating new placeholder pages only —
explicitly flagged provisional/easy to bulk-adjust later, not a claim about
her real cadence.

**Created 69 placeholder Content Calendar pages** — Day 5 through Day 84 of
90 (skipping dates already occupied by a Weekly Vlog entry: Days 8, 15, 22,
29, 36, 43, 50, 57, 64, 71, 78; and skipping Sept 6/8/9, already covered by
existing entries). Each page: Channel @blkgrlco, Content Type "Short-Form
Cutdown", Status "Idea", Platforms [TikTok], computed Publish Date, and a
Notes field spelling out the provisional/estimated nature of the label so
it's never mistaken for a confirmed schedule. Dates run 2026-09-10 through
2026-11-28.

**Follow-up (2026-09-11, same day):** Omnia clarified the run's real
structure — 13 weeks of long-form progress reports + 90 daily short-form
vlogs of her completing her daily goals, as two distinct, parallel content
types (not one subsuming the other). Verified via SQL query against the
Content Calendar that the **13 long-form entries already fully exist**
(Weekly Vlog 1–13, dated 2026-09-08 through 2026-11-29) — no gap there.
The daily-short list, however, was missing a short-form entry for every day
that already had a long-form recap (Day 1, 8, 15, 22, 29, 36, 43, 50, 57,
64, 71, 78, 90), since the original 69-page batch skipped those dates
assuming the weekly recap covered them. Added **13 new daily-short pages**
for those days, dated to match their already-existing, real weekly-vlog
dates (not invented dates) — e.g. Day 8 daily short uses Weekly Vlog 2's
real 2026-09-13 date. Named with a "(Daily Short)" suffix to disambiguate
from the same-day-same-label long-form entry.

Day 4 remains intentionally absent from the daily-short list: its calendar
slot (2026-09-09) is already occupied by the real, Metricool-sourced "Day 3"
entry, so adding a separate "Day 4" would double-book a date that's already
covered by actual published content. Flagged rather than silently
resolved. The Day 90 finale's date (2026-11-29, elapsed Day 85 under the
straight-count formula) is a pre-existing discrepancy in her own plan, not
introduced by this pass — noted directly on the new Day 90 daily-short
entry's Notes field.

## Scheduling source of truth: Metricool (confirmed 2026-09-11)

Omnia confirmed directly: **Metricool will be the only app used for
publishing.** This resolves the three-way Plann/Clem/Metricool question
flagged during the Notion reorganization pass above. Recommendation given
before her confirmation: Metricool was the only one of the three actually
connected across all three brands, and its draft → review → approve flow
(`createScheduledPostForReview` / `sendScheduledPostForReview`) already
matches the standing rule that nothing posts without her sign-off — no
reason to maintain Plann's manual view or Clem's paid trial in parallel.
Updated `BRAND_BIBLE.md` §8 to state this as a locked rule, not an open
question. Plann and Clem are retired from the publishing workflow; nothing
else in this repo depended on either, so no further cleanup needed.

## Notion page decluttering pass (2026-09-11)

Omnia: "too cluttered, I have to scroll so far down to get to the actual
information." Diagnosed by fetching the Hub and all 3 channel pages: the
live Content Calendar/Idea Bank trackers were buried under weeks of
accumulated reference material (production workflow write-ups, script
templates, SEO frameworks, editorial technique notes) on every page.
Confirmed approach with Omnia via AskUserQuestion: move the trackers to
the top of each page rather than splitting into sub-pages or just adding
navigation.

**Restructured (content reordered, nothing deleted):**
- **Hub:** moved Channels / Trackers / Feed Preview from near the bottom
  to right after "Who this is for" — now the first thing visible after the
  intro. Also consolidated the stale "Auto-Posting Setup — Clem" +
  "Manual Scheduling — Metricool" sections (which still described a
  three-way undecided Plann/Clem/Metricool comparison) into one short
  "Publishing — Metricool (confirmed 2026-09-11)" callout, matching the
  now-resolved decision above.
- **@blkgrlco, @blkgrlcotoo, @uglyinbetween:** moved each page's "Tracked
  here" database section from the bottom to right after the intro callout.
  Reference material (weekly content model, series frameworks, script
  templates, brand palettes, SEO notes) now follows below the trackers
  instead of preceding them.

No content was deleted — this was purely a reorder + one stale-content
consolidation, done via `notion-update-page` (`update_content`, exact
search/replace on the existing markdown) rather than a full rewrite, to
minimize risk of losing anything.

## @blkgrlcotoo editing direction locked (2026-09-14)

Direction received for how a @blkgrlcotoo travel edit should *feel*,
explicitly framed as "the agent should edit, not invent the creative
direction." Treated as an explicit approval (per the rule at the top of
this file) rather than a candidate, and written into
`brands/blkgrlcotoo.md` § Editing Feel, with a ready-to-paste companion
prompt at `../agents/BLKGRLCOTOO_EDITOR_PROMPT.md` and a condensed block
added to the @blkgrlcotoo section of `../agents/EDITOR_AGENT_PROMPT.md`
(recompiled 2026-09-14 under the standing auto-refresh habit).

**The thesis:** a video postcard sent to a close friend — not a travel
vlog, tourism spot, influencer montage, or polished cinematic travel ad.
Success condition is "I was supposed to be there," then "I'm going."
Supporting rules: personal over perfect (imperfect framing stays in),
mixed media as first-class material (photos, screenshots, maps, menus,
tickets), memory-flip pacing instead of a beautiful-shot montage,
emotional rather than chronological order, annotation-scale typography,
collage that breathes, natural sound preserved as storytelling, and
grading for the place rather than a preset.

**Promoted, not invented:** this direction confirms most of the
2026-09-11 Pinterest-board techniques that were logged at Medium
confidence as candidates — 3-beat "what I wore / where I went / what I
got," overhead flat-lays, object-label callouts, Maps/ratings-screenshot
inserts, photo-booth filmstrip collage, camera-viewfinder framing. Those
are now usable layout vocabulary. **The glossy 3D Canva
sticker/embellishment direction stays unadopted** — the direction doesn't
mention it either way, so the existing flag stands.

**Three apparent conflicts, resolved as complementary rather than by
deleting either side** (documented in both new files so a future refresh
doesn't "fix" one):
1. "Don't overuse transitions" vs. "no graphic or transition should be
   silent" — different subjects. Use few transition effects; the ones used
   still carry sound.
2. "Don't organize chronologically" vs. "cut the actual transition between
   locations" — also different subjects. Reorder the day freely; the
   movement between two adjacent talking moments still has to be on
   screen.
3. "Not aggressively graded / nostalgic and filmic" — this is the intent
   behind the locked five-LUT film-emulation kit, not permission to skip
   the two-step pipeline and hand-grade.

**Open item raised by this direction:** the journal-annotation look
implies a handwritten hand, but no handwritten font is licensed to
@blkgrlcotoo (`Editor's Hand` is @blkgrlco's; `Hello Scratchy` is
unassigned). Interim rule written into both files: annotation text is set
in TAN Memories / Perfectly Nineties, small and lowercase, with the
journal feeling carried by scale, placement and restraint — ask before
substituting a script lookalike.

## New @blkgrlco format: Yaps (2026-09-15)

Filming sheet for "Yap batch 01" received and adopted into
`../growth/CONTENT_STRATEGY.md`; source preserved verbatim at
`source/blkgrlco-yap-batch-01.md`.

One take, straight to camera, vertical, TikTok + Instagram. Hook first,
then three prompts talked through in her own words — prompts, not a script,
and takes are not redone for delivery because the edit cuts every pause and
um. Sits alongside the daily shorts and the Sunday long-form as a third
@blkgrlco format.

**Two things here are new information, not just a new format:**
- **A sharper audience definition than the channel-wide demographic:** the
  viewer who tried the methods, couldn't stick, is ready to commit, and
  needs someone to go along with. Filmed as if FaceTiming her. This is more
  specific than "Black women 25–40 prioritizing personal growth" in
  `brands/blkgrlco.md` and is worth carrying into hooks and copy beyond
  yaps.
- **"No methods, no tips."** The format explicitly refuses to teach — it
  demonstrates. All five batch-01 hooks are a miss, a delay, or a failure
  said out loud, which is the same honesty spine as the weekly vlog's
  "wins and losses included."

Logged as adopted rather than candidate: this was given as direction, not
as a reference board. **Three conflicts with locked rules were flagged in
the strategy doc rather than resolved** — the sheet's Poppins caption font
(not in `FONT_LIBRARY.md`; @blkgrlco's locked caption face is Editor's
Hand), the `/Volumes/T7/@blkgrlco/yaps/00_raw/` path sitting outside the
locked `project hhh` tree, and "phone or Pocket 3" when the locked grade
pipeline assumes Pocket 3 D-Log M.

## Winning patterns
| Type | What worked | Why (if known) | Confidence |
|---|---|---|---|
| Hook | `[none yet]` | | |
| Title | `[none yet]` | | |
| Thumbnail | `[none yet]` | | |
| Format | `[none yet]` | | |

## Poor-performing patterns to avoid
| Type | What underperformed | Suspected reason | Confidence |
|---|---|---|---|
| `[none yet]` | | | |

## Successful experiments
| Variable tested | Result | Applied to future content? |
|---|---|---|
| `[none yet]` | | |

## Preferences confirmed from examples
*(music, SFX, B-roll, animation, CTA style — one line per confirmed
preference, with source example noted)*

- `[none yet]`
