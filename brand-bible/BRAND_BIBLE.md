# Brand Bible — BLKGRLCO Studios

Studio-level source of truth. Covers the creator, cross-brand identity,
production reality, tools, and the studio's actual goal. Each of the three
brands has its own file with brand-specific identity, series, visuals, and
SEO — this file is the shared layer underneath all three, not a replacement
for them.

Status legend: `[NEEDS INPUT]` = still genuinely unknown. `[ASSUMPTION]` = a
default that should be confirmed. Everything else below is confirmed from
source material (see `source/`), ingested 2026-09-11.

---

## 1. Studio & Creator

| Field | Value |
|---|---|
| Studio name | BLKGRLCO Studios |
| Creator | Omnia Koumi |
| Day job | Gate/customer service/cargo agent, United Ground Express, MEM (Memphis Airport). Mon–Fri 3pm–12am — shapes both scheduling and content (gate agent shifts, standby travel). |
| Background | Prior hospitality: river cruising (Viking, American Queen), Alaska expedition work (UnCruise). |
| Creative self-identity | Documentarian. |
| Core rule, every channel | Open mid-action, end cold, name the specific activity — never the vague vibe. Authenticity and specificity over polish. |

## 2. The Three Brands

One creator, three distinct brands — each with its own audience, voice, and
visual identity. Don't average them into one generic "BLKGRLCO style."

| Brand | Handle | Format | Full detail |
|---|---|---|---|
| Personal development | @blkgrlco | Daily shorts (HOT/HEALTHY/HAPPY rotation) + Sunday long-form | `brands/blkgrlco.md` |
| Travel | @blkgrlcotoo | Long-form + shorts, vacation/weekend-only filming | `brands/blkgrlcotoo.md` |
| The Ugly In Between | @uglyinbetween | Podcast, one-take documentarian | `brands/uglyinbetween.md` |

**Confirm brand + platform before producing anything** — pillars, voice,
hashtag tiers, and title conventions all differ by brand.

## 3. Cross-Brand Identity (from @blkgrlco's brand identity doc — applies as the studio's foundational ethos, most directly to @blkgrlco)

| Field | Value |
|---|---|
| Mission | Celebrate the resilience, creativity, and self-discovery of Black women; empower intentional living through community connection, mental wellness, and a balanced life. |
| Motto | Be Free, Be Kind, Be Well. |
| Core values | Resilience, Intentional Living, Self-Care, Creativity, Community Connection, Kindness, Authenticity. |
| Voice | Empowering, authentic, aspirational. |
| Tone | Warm, relatable, inspiring — storytelling, connection, reflection. |

## 4. Audience

| Field | Value |
|---|---|
| Demographic | Black women, ages 25–40. |
| Priorities | Personal growth, intentional living, self-care, exploration. |
| Psychographic | Creative professionals, entrepreneurs, community-focused individuals seeking empowerment, authenticity, adventure. |

This is confirmed for @blkgrlco specifically (its brand identity doc's
stated target). @blkgrlcotoo and @uglyinbetween don't have their own stated
demographic yet — reasonable to assume overlap given one creator, but not
confirmed; don't presume identical targeting without checking.

## 5. Cross-Brand Creative Philosophy

- Open mid-action, end cold, no filler sign-offs — except "bye bye," which
  always stays.
- Music chosen before shooting, not added in post.
- Prioritize specific, real detail over production polish.
- Comfortable with real, specific personal detail — don't sanitize for
  "broad appeal." The honesty is the point.
- Every clip in a montage must move the story forward — cut any shot that
  just sits on a state already shown.
- Full editing/visual toolkit (documentarian rule, explainer exception, the
  7 Narrative Cuts, graphics/SFX reference, per-brand fit) lives in
  `STYLE_GUIDE.md`.

## 6. Production Reality

- Solo creator, full-time job Mon–Fri 3pm–12am.
- Weekday mornings = opportunistic capture only.
- Saturday = batch film day.
- Sunday = edit/upload/reflect/plan.
- @blkgrlcotoo (travel) is the one exception — filmed only on vacation
  days/weekends off, never squeezed into the weekday rhythm.
- Pipeline: **Plan → Film → Edit → Upload → Reflect** (full detail,
  shot-list framework, and scene structure in
  `../agents/PRODUCTION_WORKFLOW.md`).

## 7. System of Record

- **Notion** — Studios Hub (one page per channel), Content Calendar DB,
  Idea Bank DB. *"If it's not in Notion, it's not real yet."* Hub page ID:
  `3c77c3ea-6a8c-812b-8d56-e54b8ad3fa36` — corrected 2026-09-11; the ID
  originally recorded in the source doc (`...aabb-cb4244d033d3`) actually
  resolves to a single Content Calendar entry, not the hub page itself.
- **Samsung T7 SSD** — raw footage, `project hhh` folder, one subfolder
  per video. The reliable path.
- **Google Drive** — backup/transfer only; chokes on large files.

## 8. Connected Tools & Publishing

- **Metricool** — connected to **all three brands** as of 2026-09-10:
  @blkgrlco (id 4359163; Instagram, Pinterest, TikTok, YouTube — the
  account with real posting history), @blkgrlcotoo (id 6918875; Instagram,
  TikTok, YouTube), @uglyinbetween (id 6918899; Instagram, TikTok,
  YouTube). Previously only @blkgrlco was connected — corrected 2026-09-11
  after a live check.
- **vidIQ** — connected to @blkgrlcotoo's YouTube (brand new, no content
  yet as of last check) — usable for general/competitor research, not yet
  for own-channel analytics.
- **Epidemic Sound** — music/SFX licensing, confirmed in use 2026-09-11.
  See `SOUND_LIBRARY.md` for the actual per-brand track/SFX inventory.
- **Nothing auto-publishes.** Every script, edit, caption, thumbnail, and
  scheduled post — including anything queued in Metricool — goes through
  Omnia for approval before it goes out.
- No live YouTube algorithm/analytics access exists in this toolkit —
  research is grounded in live web search only; say so rather than
  overclaiming.
- Competitor benchmarking: no fixed list — find comparable creators in
  personal-development / travel / healing-podcast spaces as needed.

## 9. Studio-Level Goal — read this before making any strategy recommendation

**The actual goal is consistency, storytelling craft, and putting out
content she loves — regardless of analytics performance. Not subs,
watch-hours, or monetization.**

A monetization target ("monetized on YouTube by Feb 2027") was briefly set
2026-09 and dropped the same day, after the real gap became clear (120
subs / 28 min watch time vs. the 1,000 subs / 8,000 watch-hour bar).
Chasing that number was judged a distraction from becoming a better, more
consistent creator. **Do not resurrect this as an active target or steer
content decisions toward it** — kept here as context only.

Practical implication: format/cadence/topic decisions optimize for creative
quality and consistency, not CTR, watch-hour accumulation, or monetization
thresholds. See `../growth/MONETIZATION_STRATEGY.md` and
`../growth/ANALYTICS_SYSTEM.md` — both are written around this constraint.

## 10. How This System Talks to Her

- Short and direct, no preamble.
- Given a one-line correction, apply it exactly and move on — don't
  re-explain the change back.
- Flag contradictions with a locked brand/visual/naming decision rather
  than silently resolving them — let her decide.

---

## Open questions

1. **"Travel" as a pillar vs. @blkgrlcotoo as its own brand** — the
   @blkgrlco brand-identity doc lists Travel as one of @blkgrlco's own four
   content pillars, while @blkgrlcotoo exists as a fully separate travel
   brand. Not resolved as a conflict yet (see `brands/blkgrlco.md`) — worth
   confirming whether that pillar line is stale or intentional overlap.
2. **@blkgrlcotoo / @uglyinbetween audience specifics** — only @blkgrlco
   has a stated demographic/psychographic; the other two brands' audience
   profiles are inferred, not confirmed.
3. **Competitor list** — no fixed creators named for any of the three
   brands yet.
4. **"Aurelia Gray" / "Rachel McDermott"** — aesthetic references used for
   @blkgrlco with unconfirmed real handles.
