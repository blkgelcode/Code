# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A prose knowledge base, not a software project. There is no build, no test
suite, no linter, no package manifest, no CI. Every tracked file is either
Markdown or a binary creative asset (fonts under
`brand-bible/brands/assets/fonts/`, SFX reference clips under
`brand-bible/brands/assets/sfx-reference/`).

It is the memory system for **BLKGRLCO Studios** (creator: Omnia Koumi) — a
three-brand YouTube/TikTok/IG studio — and for a team of specialized AI
agents that research, script, edit, design, and analyze its content. The
value is in the rule hierarchy and the correction log, not in any executable
artifact. `README.md` has the per-file index; don't duplicate it here.

## Verifying a change

Since nothing compiles, "does this work" means "are the cross-references and
locked decisions still consistent." Useful checks after editing:

```bash
# Every backtick-quoted doc/script reference resolves (file-relative or repo-root)
grep -rnoE '`[A-Za-z_./-]+\.(md|py)`' --include='*.md' . | tr -d '`' \
  | while IFS=: read -r f l ref; do d=$(dirname "$f"); \
      [ -e "$d/$ref" ] || [ -e "./$ref" ] || echo "UNRESOLVED $ref <- $f:$l"; done | sort -u

# Retired names (CREATIVE_MEMORY.md "Retired") — every hit must be a
# do-not-use mention, never a live usage
grep -rniE 'the becoming|young hot and outside|fuck it book it' --include='*.md' .

# Monetization/watch-hour mentions — every hit must be de-prioritizing
# framing, never an active target (BRAND_BIBLE.md §9)
grep -rniE 'monetiz|watch.hour' --include='*.md' growth/ agents/
```

Known unresolved references, as of this file's writing — don't be surprised
by them, and don't fabricate the missing pieces:

- **`_tools/preflight.py`** — the QC step in `agents/AGENTS.md`,
  `agents/PRODUCTION_WORKFLOW.md`, and `brand-bible/brands/blkgrlco.md`
  instructs running it before any master is called finished. **That file
  does not exist in this repo.** Don't invent it or fake its output — say the
  pre-flight script is missing, or ask whether it should be written.
- `brand-bible/source/*` points at `BLKGRLCO-STUDIO-OVERVIEW.md`; the real
  file is `brand-bible/source/blkgrlco-studio-overview.md`. Source files are
  verbatim — leave them alone.
- `agents/EDITOR_AGENT_PROMPT.md` and `brand-bible/brands/blkgrlco.md` cite a
  few `brand-bible/` docs by bare filename. Path conventions in this repo are
  mixed — some references are file-relative (`../BRAND_BIBLE.md`), some are
  repo-root-relative (`brand-bible/BRAND_BIBLE.md`). Match whichever the
  surrounding file already uses.

## Rule hierarchy — the thing that matters most here

Documents are not peers. When two files disagree, resolve in this order:

1. **`brand-bible/brands/*.md`** — a brand file wins over general guidance
   *for that brand*. `@uglyinbetween`'s rules in particular are overrides,
   not variations (e.g. it is fully exempt from the explainer exception that
   cuts dead air).
2. **`brand-bible/BRAND_BIBLE.md`** — studio-level source of truth: creator,
   production reality, tools, and §9 (the studio goal).
3. **`brand-bible/STYLE_GUIDE.md`** / `brand-bible/SCRIPTWRITING_GUIDE.md` /
   `growth/*.md` — the shared toolkit underneath all three brands.
4. **`brand-bible/CREATIVE_MEMORY.md`** — a *log*, not law. Entries here are
   candidate rules and project-specific context.
5. **`brand-bible/source/`** — original ingested documents, preserved
   verbatim. **Never edit these**; everything above is derived from them.
   Some are deliberately stale (superseded by the 2026-09-11 restructure).

Status markers inside these docs are load-bearing: `[NEEDS INPUT]` = still
genuinely unknown, `[ASSUMPTION]` = a default awaiting confirmation. Don't
resolve either by guessing.

## Rule promotion protocol

New observations land in `brand-bible/CREATIVE_MEMORY.md` first. An entry is
promoted into `brand-bible/BRAND_BIBLE.md`, `brand-bible/STYLE_GUIDE.md`, or
`brand-bible/SCRIPTWRITING_GUIDE.md` — becoming a permanent rule — **only**
when Omnia approves it explicitly or it is confirmed across ≥2–3
independent examples. A single example is never
a permanent brand rule. Corrections get logged with mistake → correction →
date so they aren't repeated.

## Standing regeneration rule

`agents/EDITOR_AGENT_PROMPT.md` is a *compiled artifact* of `brand-bible/`,
not a source document. Whenever an editing-relevant rule gets locked
anywhere in `brand-bible/` (technical specs, per-brand editing standards,
fonts, palettes, color grading, sound design, thumbnail workflow),
regenerate that file from the updated sources and re-send it without being
asked. Regenerate rather than hand-edit — hand-edits drift from the source
of truth. Non-editing rules (SEO, analytics, monetization, general strategy)
don't trigger this, since the prompt is scoped to editing only.

## Constraints that govern any output

- **Three brands, never averaged.** @blkgrlco (personal development),
  @blkgrlcotoo (travel), @uglyinbetween (podcast) differ in voice, visual
  identity, pillars, hashtag tiers, title conventions, and editing rules.
  Confirm brand *and* platform before producing anything.
- **Do not optimize for growth.** The studio's goal is consistency,
  storytelling craft, and content she loves — not subs, watch-hours, or
  monetization. A monetization target was set and scrapped the same day in
  2026-09 precisely because chasing it was a distraction. Keep it as context
  only; never resurrect it as an active target or let it weight a decision
  (the idea-scoring framework in `agents/PRODUCTION_WORKFLOW.md` deliberately
  excludes monetization potential).
- **Nothing auto-publishes.** Every script, edit, caption, thumbnail, and
  scheduled post — including anything queued in Metricool — goes to Omnia
  for approval. Metricool is the only publishing/scheduling tool; Plann and
  Clem are out.
- **Notion is the system of record** ("if it's not in Notion, it's not real
  yet"). Studios Hub page ID `3c77c3ea-6a8c-812b-8d56-e54b8ad3fa36` — an
  older ID in `source/` resolves to a single calendar entry, not the hub.
- **No live analytics access** exists in this toolkit; research is grounded
  in web search. Only @blkgrlco has real posting history. Say so rather than
  fabricating trends from near-zero data.
- **Retired names are permanently retired** — see the table in
  `brand-bible/CREATIVE_MEMORY.md`.
- **No AI-generated thumbnails, ever** (viewer feedback, logged correction).

## Working style Omnia expects

Short and direct, no preamble. Given a one-line correction, apply it exactly
and move on — don't re-explain the change back. When a request contradicts a
locked brand/visual/naming decision, **flag the contradiction and let her
decide**; never silently pick a side. Asking one step ("write the script")
returns only that step, not the full 13-step pipeline in
`agents/PRODUCTION_WORKFLOW.md`.
