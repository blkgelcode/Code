# BLKGRLCO Studios — AI Production System

The operating system for a coordinated team of specialized AI agents that
research, strategize, write, edit, design, optimize, analyze, and
continuously improve content for **BLKGRLCO Studios** — Omnia Koumi's
three-brand creative studio:

| Brand | Handle | Format |
|---|---|---|
| Personal development | @blkgrlco | Daily shorts (HOT/HEALTHY/HAPPY) + Sunday long-form |
| Travel | @blkgrlcotoo | Long-form + shorts, vacation/weekend-only filming |
| The Ugly In Between | @uglyinbetween | Podcast, one-take documentarian |

It is not a content generator. It is a **memory system + workflow** so that
every piece of content gets better because of everything made before it.

## How this is organized

| File | What it holds |
|---|---|
| `brand-bible/BRAND_BIBLE.md` | Studio-level source of truth: creator, cross-brand identity, production reality, tools, and the studio's actual goal. |
| `brand-bible/brands/blkgrlco.md` | @blkgrlco identity, series, daily-vlog editing standard, visual identity, SEO. |
| `brand-bible/brands/blkgrlcotoo.md` | @blkgrlcotoo identity, series, production constraints, SEO. |
| `brand-bible/brands/uglyinbetween.md` | @uglyinbetween identity, five pillars, voice, visual identity, episode structure. |
| `brand-bible/STYLE_GUIDE.md` | Cross-brand editorial toolkit: documentarian rule, the 7 Narrative Cuts, graphics/SFX reference, technical/delivery specs, thumbnail workflow. |
| `brand-bible/SCRIPTWRITING_GUIDE.md` | Cross-brand voice rules + per-brand voice link-out. |
| `brand-bible/CREATIVE_MEMORY.md` | Running log: corrections, retired names, scrapped decisions, winning/poor patterns. This is the file that makes the system get smarter over time. |
| `brand-bible/source/` | Original source documents, preserved verbatim, that everything else here is derived from. |
| `brand-bible/FONT_LIBRARY.md` | Studio font inventory — which fonts are licensed, which brand each is assigned to, and which are still unassigned. |
| `brand-bible/SOUND_LIBRARY.md` | Studio music/SFX inventory (Epidemic Sound) per brand — scaffold as of 2026-09-11, being built out. |
| `agents/AGENTS.md` | The 11 specialized agent roles and their output formats. |
| `agents/PRODUCTION_WORKFLOW.md` | The 13-step production pipeline, shot-list framework, production schedule, approval system. |
| `agents/EDITOR_AGENT_PROMPT.md` | Compiled, copy-paste-ready system prompt for a separate editing agent — locked-only rules (technical specs, per-brand editing standards, fonts, palettes, color grading, sound design, thumbnail workflow). Refresh it after any new rule gets locked in `brand-bible/`. |
| `growth/SEO_GUIDE.md` | Per-brand keyword pillars, hashtag tiers, title/description rules. |
| `growth/CONTENT_STRATEGY.md` | Production rhythm, packaging logic, content funnel, calendar framework. |
| `growth/ANALYTICS_SYSTEM.md` | What gets tracked, connected tools, and — critically — what analytics are *for* here (see below). |
| `growth/MONETIZATION_STRATEGY.md` | Currently inactive by design — see Studio Goal below. |
| `growth/WEEKLY_REPORT_TEMPLATE.md` | Template for the Sunday "reflect" step. |

## The studio's actual goal (read before recommending anything growth-related)

**Consistency, storytelling craft, and content she loves — not subs,
watch-hours, or monetization.** A monetization target was set and scrapped
the same day in September 2026 after the real gap became clear, specifically
because chasing it would distract from becoming a better, more consistent
creator. Every growth-related file in this repo is written around that
constraint — don't reintroduce growth-chasing framing. Full detail:
`brand-bible/BRAND_BIBLE.md` §9.

## How to use this system

- Give a topic/idea + which brand → runs through `agents/PRODUCTION_WORKFLOW.md`.
- Give an example (video, thumbnail, script, footage, feedback) → analyzed
  against `brand-bible/CREATIVE_MEMORY.md`, confirms or proposes a rule for
  approval, or gets logged as project-specific.
- Ask for analytics review → `growth/ANALYTICS_SYSTEM.md` framework
  applies, framed as craft feedback, not growth pressure.
- **Nothing auto-publishes.** Every deliverable — including anything queued
  in Metricool — goes through Omnia for approval.
- Confirm brand + platform before producing anything; the three brands
  differ in voice, visuals, and audience.

## Open questions

See `brand-bible/BRAND_BIBLE.md` for the current list — mainly around
@blkgrlcotoo/@uglyinbetween audience specifics, unconfirmed creator-reference
handles, and one unresolved overlap between @blkgrlco's own "Travel" pillar
and @blkgrlcotoo as a separate brand.
