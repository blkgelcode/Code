# Social Media Brand — AI Production System

This repo is the operating system for a coordinated team of specialized AI
agents that research, strategize, write, edit, design, optimize, analyze,
and continuously improve content across social platforms.

It is not a content generator. It is a **memory system + workflow** so that
every piece of content gets better because of everything made before it.

## How this is organized

| File | What it holds |
|---|---|
| `brand-bible/BRAND_BIBLE.md` | Identity, audience, content pillars — the source of truth for "does this sound like us." |
| `agents/AGENTS.md` | The 11 specialized agent roles, their responsibilities, and required output format for each. |
| `agents/PRODUCTION_WORKFLOW.md` | The 13-step pipeline from idea → published + repurposed content, plus the human-approval checkpoints. |
| `brand-bible/STYLE_GUIDE.md` | Visual identity, editing style, color grading, thumbnail rules. |
| `brand-bible/SCRIPTWRITING_GUIDE.md` | Voice, tone, structure rules for scripts. |
| `growth/SEO_GUIDE.md` | Keyword/discoverability approach per platform. |
| `growth/CONTENT_STRATEGY.md` | Content ecosystem model, repurposing map, content funnel, calendar framework. |
| `growth/ANALYTICS_SYSTEM.md` | What gets tracked, how experiments are run, how conclusions get made. |
| `growth/MONETIZATION_STRATEGY.md` | Revenue stream plan and brand-fit filter for sponsorships. |
| `brand-bible/CREATIVE_MEMORY.md` | Running log of learned rules — winning hooks/titles/thumbnails, poor-performing patterns, corrections you've given. This is the file that makes the system get smarter over time. |
| `growth/WEEKLY_REPORT_TEMPLATE.md` | Template for the recurring content intelligence report. |

## Current status

**This is a scaffold, not a finished Brand Bible.** No brand examples (videos,
scripts, thumbnails, colors, analytics) have been provided yet, so every file
below contains a working framework with explicit `[NEEDS INPUT]` markers
instead of invented specifics. Nothing here should be treated as your actual
brand rules until real examples are analyzed and the placeholders are
replaced — that's the fastest way to make this system say something generic
that isn't really your voice.

See the open questions at the bottom of `brand-bible/BRAND_BIBLE.md` for the
highest-value information needed to make this real.

## How to use this system going forward

- Give a topic/idea → the system runs it through `agents/PRODUCTION_WORKFLOW.md`.
- Give an example of your work (video, thumbnail, script, footage) → it gets
  analyzed against `brand-bible/CREATIVE_MEMORY.md` and either confirms an
  existing rule, proposes a new one for your approval, or is logged as
  project-specific (not a permanent rule).
- Ask for analytics review → `growth/ANALYTICS_SYSTEM.md` framework is applied
  to whatever data you provide.
- Nothing is published or treated as a permanent brand rule without your
  approval, per `agents/PRODUCTION_WORKFLOW.md` Part 6.
