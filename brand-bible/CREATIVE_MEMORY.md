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
| 2026-11-13 | `source/blkgrlco-claude-code-editor-checklist.md` (her own revised Claude Code Editor Checklist, uploaded) | **Checklist of record**, supersedes the pasted draft below. Adopted as `../agents/EDITOR_CHECKLIST.md`. Confirms the five Nov 11 retirements (moved to the Retired table), replaces cut-all-silence with "cut dead air, keep a pause only when it carries the moment", adds motion specs, shot variety, the long-form → Short rule and the Dec 22 priority. The Bin's Hook Machine no longer requires "day N of 90" in a hook. |
| 2026-11-13 | `source/blkgrlco-editor-checklist-2026-11-13.md` (pasteable editor checklist for Claude Code, written in a chat session from her Nov 11 reset, pasted by her without comment) | Adopted as `../agents/EDITOR_CHECKLIST.md`; house rules merged into `brands/blkgrlco.md` and the editor prompt. **Five locked rules it reports replaced on Nov 11 are logged as pending her confirmation, not retired** (see below). |
| 2026-11-11 | `source/blkgrlco-hhh-weekly-edit-breakdown.md` (BLKGRLCO: HHH Weekly Edit Breakdown, her editorial plan addressed to Claude Code) | Merged as approved story-type guidance for the 90-Day HHH Run dailies into `brands/blkgrlco.md`, `../agents/PRODUCTION_WORKFLOW.md` (editing procedure), `../growth/ANALYTICS_SYSTEM.md` (two-week test) and `../agents/EDITOR_AGENT_PROMPT.md`. **Six conflicts/gaps with already-locked rules flagged below for her decision, not resolved.** |
| 2026-09-11 | 3 images, labeled "ugly in between visual identity" — two-host warm/colorful studio setups | **Flagged as a conflict rather than merged** (per the standing rule in `brands/uglyinbetween.md`: flag a trending-convention conflict, don't quietly override). All three showed a two-host conversational format, warm/colorful palette, and a Y2K-nostalgia set — directly conflicting with the locked solo, B&W, aubergine/terracotta identity. Asked via AskUserQuestion; answer: **studio/setup inspo only**. Adopted: the warm neutral physical set/lighting reference from one image (bean bags, wood tables, soft light) as recording-space inspiration only — final visual treatment stays locked B&W. **Explicitly not adopted:** the two-host format, the Y2K nostalgia wall, the candid handwritten-marker promo-graphic style, and the one-word episode-title convention ("FEAR") seen in these images — none of these override the locked solo format/identity/naming convention. |

## Podcast renamed: "I Wish Somebody Had Told Me" (2026-10-03)

She renamed the podcast from *The Ugly In Between* to *I Wish Somebody
Had Told Me* (first logged as "Someone"; corrected the same day from her
Show Hub doc, where "Someone" is only Ep 0's title).
Interview answers: **new handle** (chosen but not yet given; @uglyinbetween
stays in docs and Metricool until she gives it) · **sign-off stays "Stay
ugly."** (locked outro unchanged) · **identity is being rethought**, so the
tagline, Five Pillars, visual identity (B&W, palette, type, thumbnail font)
and brand hashtag are marked under review, not locked. Kept: voice,
production approach, the seven episode rules. Ep 0 is "I Wish Someone Had
Told Me"; the show is "...Somebody...". Dated entries
below are history and keep the old name.

## Podcast handle, hashtag and storage confirmed (2026-10-03)

Handle **@iwishsomeonetoldme** (formerly @uglyinbetween; "someone" in the
handle, "Somebody" in the show name, both as she gave them). Brand hashtag
**#stayugly**. The handle and hashtag are swapped in every current doc;
source docs and dated history keep the old ones. The Metricool connection
(id 6918899) was made under the old handle, so check it after the platform
renames. **Storage:** raw footage is on her T7, which mounts as
"Untitled". She uploads it to the cloud session, and Code sends the
finished `EpNN_*` masters back to her to save on Untitled. Details are in
`podcast/RULES.md` → "Where things live".

## Podcast playbook received: Show Hub doc (2026-10-03)

She shared her Show Hub doc (https://claude.ai/artifact/M7L7vsPcDpSUj27pyG8jt6).
Its Production System tab is the playbook, which `/podcast-episode`
now reads live on every run (`podcast/PLAYBOOK.md` is only a pointer). It
settled four open questions: the show is "I Wish **Somebody** Had Told Me";
Season 1 is Ep 0 + 10 episodes, all written; every blog post has a real
resources block (LifeStance + 988, RAINN on Ep 5, *Attached* on Ep 8),
inline in the "Let me be clear…" paragraph, so R7 now checks a verbatim
`copy/resources_block.md`; and the five agents are defined. **Retired,
confirmed by her the same day:** the podcast's one-take, never-streamline
documentarian rule (the long-form is cut like the daily vlogs: script cut
tight, punch-ins, b-roll). **Sign-off confirmed:** "Signed, a ___. Stay
___.", where "Stay ___" emphasizes what the episode was about. It
replaces her earlier "keep 'Stay ugly.'" answer; #stayugly stays the brand
hashtag. New show rules: never show a media clip in
any version, credit the source in the description, and the language is
uncensored.

## Podcast episode pipeline locked (2026-10-03)

**R1 widened later the same day:** nothing goes to Drive, Rella or any
platform without her sign-off, not just "nothing publishes." The skill no
longer uploads review masters to Drive before sign-off. Where she reviews
masters is an open question in `podcast/_inbox/from_code.md` (Q1).

She asked for a `/podcast-episode <N>` skill
(`.claude/skills/podcast-episode/`) and locked seven rules for every
@uglyinbetween episode: sign-off before anything publishes; −16 LUFS on
audio and video; music-free cold open; one consistent intro/outro; captions
on every video and vertical; her words only (order and trim, never
rewrite); show notes reuse the blog post's Resources block. Full table:
`podcast/RULES.md`, checked mechanically by `verify.py`.
Interview answers: no footage filmed yet; outputs go in this repo
(`podcast/`), with media gitignored because the repo is public; theme =
"I Deserve Better (Instrumental Version)" (spring gang); outro = her own
"Stay ugly." take with the theme under it, which she chose over a fully
cold end; per-episode `_inbox/from_chat.md` + `from_code.md` as a simple
newest-first log; episode numbers tracked in `podcast/EPISODES.md`.
**Still open:** the five-role playbook (audio master, sound design, video
edit, verticals, packaging). She's sending it, and it will be saved as
`podcast/PLAYBOOK.md`. The skill refuses to run a role whose section is
missing. Ep 0's blog Resources block is still a placeholder.

## Editor checklist, her version (2026-11-13, later the same day)

She uploaded her own revised **Claude Code Editor Checklist**, which
replaces the chat-pasted draft logged below. Adopted as
`../agents/EDITOR_CHECKLIST.md`. What it settles:

- **The five Nov 11 retirements are confirmed** (her document states
  them as "Retired on Nov 11"): the "Day N of 90" title format, the auto
  short-form per video, the forced Pin Board CTA, cut-all-silence, the
  5-line story-map approval gate. Moved to the Retired table. This closes
  the 11-11 flags #3 (CTA) and #5 (the day label stays as a small on-screen
  label, just not a title) and the pending list below.
- **Dead air:** "Cut dead air in talking-heads. Keep a pause only when it
  carries the moment." Replaces the daily-vlog "cut all dead air" rule
  and the @blkgrlco reading of the explainer exception.
- **Shorts:** every long-form is cut into a Short that starts mid-action.
  Dailies no longer get an automatic short-form.
- **New:** simplify (remove context the viewer doesn't need); pop-ups on
  the exact word, never early (if early, wait about 2 s); shot variety
  from real footage; punch-ins hold on identical keyframes first; motion
  specs (pop-ups scale 0 → 105% → 100%, opacity 0 → 100, slide in from
  the edge over 8–10 frames; titles slide in with ease-in on the end
  keyframe; PNG titles on the track above footage).
- **Priority through 2026-12-22: watch time and thumbnails.** Logged as
  her time-boxed craft focus, not a growth target (BRAND_BIBLE §9 stands).
- **Code change:** the Bin's Hook Machine check "keeps day N of 90" is
  replaced by "doesn't open on day N of 90", and its prompt tells Claude
  the day goes in an on-screen label, not the hook.

**Revision, same day: a "Shoot day (new)" section.** Coverage of at
least 5 shot types per scene, 3 takes at different energy levels for
mechanical moments, one real take (no redo) for reactions and the
honest result, b-roll mixed with handheld talking-through-the-struggle
shots, frames without her, in-frame movement on a tripod, and shrinking
every "wouldn't it be cool" idea to what she can film alone. Source file
updated verbatim; merged into the checklist, the workflow's shot-list
section, the brand file and the editor prompt.

**Her correction, same day: "SFX are no requirement."** Applied: sound
effects are optional on every @blkgrlco edit, banned on skincare nights;
the STYLE_GUIDE's "no graphic or transition should be silent" rule is
downgraded to optional. Still open: Poppins' role on @blkgrlco; her
sticker cue list.

## Editor checklist received (2026-11-13)

She pasted a checklist "for Claude Code as your editor," written in a
chat session from her Nov 11 reset and the retention video. Adopted as
`../agents/EDITOR_CHECKLIST.md`. Its "(kept)" items match rules already
here (LUT then reframe, punch-ins on real reactions, honest result gets
its time, her sign-off). New rules written down for the first time: no
employer or job named or shown; phone on screen only when essential;
skincare has no product labels and no SFX; YouTube original stickers
only, TikTok/IG stickers from her cue list; Poppins for @blkgrlco only;
three thumbnails and three titles per long-form; 3:00 PM CT posting in
numerical order; the edit list goes to her before any render; one
low-res preview judged on curiosity, cut, clarity, connection.

**Reported replaced on Nov 11, pending her confirmation.** The chat told
her it left these out and asked "tell me if any should stay." She hasn't
answered, so they stay locked in the brand file with an annotation, and
the editor asks before relying on either version:

1. The "Day N of 90" **title** format (the Nov 11 plan still uses "Day
   N/90" as a small context label). Resolves the 11-11 flag #5 if
   confirmed. The Bin's Hook Machine still checks "day N of 90 kept?";
   change that once she confirms.
2. The automatic short-form cut per video ("always deliver a Shorts cut
   under 3:00").
3. The forced "make your own Pin Board" CTA. Resolves the 11-11 flag #3
   if confirmed.
4. Cutting all silence (the daily-vlog "cut all dead air" rule and the
   explainer exception for @blkgrlco). If confirmed, the cross-brand
   documentarian default applies instead.
5. The 5-line story-map approval step (not written in this repo; the
   dashboard's Story map stage).

**New open questions:** which role Poppins takes on @blkgrlco next to
the locked Advercase / Editor's Note / Editor's Hand; whether "no sound
effects" on skincare overrides "no graphic should be silent" (read as
yes, for skincare only); where her sticker cue list lives. The chat's
closing line about a "new code editor" possibly meaning a different tool
is its question to her, unanswered here.

## HHH Weekly Edit Breakdown received (2026-11-11)

She handed over an editorial plan for the 90-Day HHH Run dailies: seven
repeatable story types for one week (two skincare nights, two workouts,
one meal-prep day, one therapy day, Sunday recap/reset), a shared editing
standard (situation first, one goal → attempt → result → takeaway, cut
when the information changes, honest outcomes only), a Claude Code
editing procedure, and a two-week evaluation. Summary in
`brands/blkgrlco.md`; procedure in `../agents/PRODUCTION_WORKFLOW.md`;
evaluation in `../growth/ANALYTICS_SYSTEM.md`.

**Retention baseline she supplied (one Reel, logged as reference only):**
a 1:49 Reel with 14 s average watch time and a sharp early decline; one
follow; 37.8% skip rate labeled "Lower"; 348 views = 59 Instagram + 289
Facebook, with the views-over-time graph Instagram-only. Her own caveat:
one snapshot, not proof of a channel-wide problem or a cause, and 14/109
is not a completion rate (Instagram's average watch time is watch time ÷
initial views). What's being tested: make the premise clear earlier and
remove repeated information while keeping honest reactions. Not "cut
everything to 14 seconds."

**Conflicts and gaps with locked rules, flagged for her decision (per
BRAND_BIBLE §10, not silently resolved):**

1. **Opener.** Locked daily-vlog rule: open every vlog on "good morning"
   and let the sentence finish. The plan: open on the actual situation or
   question, with "Day N/90" as a small label, and its sample openers are
   evening ("Tonight's goal…"), workout and therapy lines. Likely
   reading: "good morning" stays for vlogs that start in the morning and
   the plan's openers apply to the rest. Needs her confirmation.
2. **Template.** Locked vertical daily-vlog template: the 4-panel
   edge-to-edge stacked timestamp grid (6AM/12PM/6PM/10PM) with bold plain
   white captions, and the Real-Time Timestamp Cutdown framework. The
   plan describes a single-story edit (goal → attempt → result) with speech
   captions and occasional labels. These are two different edits. Which
   one the HHH dailies use going forward, or whether the grid is for a
   different video type, is her call.
3. **CTA.** Locked for the 90-Day HHH Run: "make your own Pin Board." The
   plan ends each type with an optional audience question ("What's the
   last thing you do before bed?"). Not resolved whether the question
   replaces, precedes, or alternates with the locked CTA.
4. **Week structure.** Locked lane rotation: Mon/Thu HOT, Tue/Fri
   HEALTHY, Wed/Sat HAPPY. The plan's week is activity-based (skincare ×2,
   workout ×2, meal prep, therapy, Sunday). It maps roughly (skincare →
   HOT, workouts/meal prep → HEALTHY, therapy → HAPPY) but the day
   assignments differ. Treated as the HHH Run's week, not a rewrite of
   the lane rotation, until she says otherwise.
5. **"Day N/90" label style.** The plan asks for a small context label.
   Assumption: it uses the locked label-card spec (Arial Rounded Bold,
   `#A8B118`, lowercase). Unconfirmed.
6. **Sunday.** Locked: Sunday = long-form vlog (13 Weekly Vlogs exist in
   the calendar). The plan: Sunday is a vertical recap/reset, and a longer
   YouTube recap is a separate deliverable, not automatic. Read as
   compatible (both exist); confirming that the vertical recap doesn't
   replace the weekly long-form.

**Referenced but missing from this repo:** the "Workflow Reset prompt"
the plan says to use alongside it; the "project's existing schema" for
edit decision lists (closest here: the Bin's Plan → Edit & retention clip
order, `{fid, seconds}` per clip); the footage `afv5.mov`; the Insights
screenshots. Also still missing from before: `_tools/preflight.py`, which
the standing rules require before any master.

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
| "The Ugly In Between" (show name, retired 2026-10-03) | "I Wish Somebody Had Told Me" | podcast |
| "Day N of 90" title format (retired 2026-11-11, confirmed 2026-11-13) | A real number or thing in the first 5 s; "Day N/90" only as a small on-screen context label | @blkgrlco (90-Day HHH Run) |
| Automatic short-form cut per daily video (retired 2026-11-11) | Every long-form cut into a Short that starts mid-action | @blkgrlco |
| "make your own Pin Board" forced CTA (retired 2026-11-11) | No forced CTA; an optional audience question | @blkgrlco (90-Day HHH Run) |
| Cut-all-silence (retired 2026-11-11) | Cut dead air in talking-heads; keep a pause only when it carries the moment | @blkgrlco |
| 5-line story-map approval gate (retired 2026-11-11) | The edit list, sent before any render, plus one low-res preview | @blkgrlco |

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
| @iwishsomeonetoldme | Garamond Italic (headlines) / Helvetica Neue Light (body); **thumbnail headline role superseded 2026-09-11 by Eighties Comeback** (stated directly as "for uglyinbetween thumbnails") | **Under review since the 2026-10-03 rename.** Previously: Garamond/Helvetica Neue pre-existing, locked. Eighties Comeback replaces the thumbnail-headline role specifically — flagged as a deliberate change to a previously locked font, not silently swapped. |

## Confirmed brand palettes

| Brand | Palette | Locked |
|---|---|---|
| @blkgrlcotoo | `#284376` navy, `#E58E47` marigold, `#D9D1C7` sand, `#CA5278` raspberry, `#6177A8` periwinkle | 2026-09-11, via coolors.co link — explicit, high confidence, supersedes the earlier "no palette locked" placeholder. |
| @blkgrlco | `#F0DAC2` cream, `#B68A71` tan, `#B4AD7F` sage-tan, `#636407` moss olive, `#A8B118` olive-chartreuse, `#EBB9BA` blush, `#8C0532` wine, `#49001B` oxblood, `#2E1500` espresso | 2026-09-11, confirmed directly (color-generator screenshot) — supersedes the PDF's named colors and the earlier proposed-hex guesses. `#A8B118` matches the already-locked label-card color exactly. |
| @iwishsomeonetoldme | `#3A2E39` aubergine, `#DDBEA9` terracotta | **Under review since the 2026-10-03 rename** (previously locked). |

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
| Format (Reel) | One 1:49 HHH Reel: 14 s average watch time, sharp early retention decline (2026-11-11 baseline) | Premise not clear early; repeated information (her hypothesis) | Low — one Reel, Instagram-only graph, 59 IG views. Reference, not a rule |

## Successful experiments
| Variable tested | Result | Applied to future content? |
|---|---|---|
| `[none yet]` | | |

## Preferences confirmed from examples
*(music, SFX, B-roll, animation, CTA style — one line per confirmed
preference, with source example noted)*

- `[none yet]`
