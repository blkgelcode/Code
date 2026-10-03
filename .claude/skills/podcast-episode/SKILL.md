---
name: podcast-episode
description: Run the full production chain for one episode of The Ugly In Between (@uglyinbetween): intake → implementation spec → build with five role sub-agents (audio master, sound design, video edit, verticals, packaging) → verify against the locked rules → report to the episode's _inbox, then stop before publishing. Use when Omnia invokes /podcast-episode <N>.
argument-hint: <episode number>
---

# /podcast-episode $ARGUMENTS

Episode **N = $ARGUMENTS**, folder `podcast/episodes/epNN/` (NN = N
zero-padded to 2 digits). If the argument isn't a whole number, stop and
ask for one.

The chain is fixed: **intake → spec → build → verify → report → stop.**
Don't skip a stage, don't reorder them, and never go past stop.

## Read first, every run

1. `podcast/RULES.md`: the locked rules R1–R7. These beat everything else,
   including the playbook.
2. `podcast/PLAYBOOK.md`: defines the five roles. **If it's missing, or
   any of the five roles has no section in it, stop.** Write a
   `from_code.md` entry saying which role is missing, and tell her. Don't
   invent a role definition to fill the gap.
3. `podcast/EPISODES.md`, `podcast/locked.json`,
   `brand-bible/brands/uglyinbetween.md`, and the corrections log in
   `brand-bible/CREATIVE_MEMORY.md`.
4. `podcast/episodes/epNN/_inbox/from_chat.md`, if it exists. Her newest
   notes win over anything older. A `HOLD` entry means stop after the
   spec.

## Inbox protocol

Each episode has `_inbox/from_chat.md` (hers: notes and decisions for
Code) and `_inbox/from_code.md` (yours: reports back).

- **Never edit `from_chat.md`.** Read it at the start of every run and
  again right before reporting, in case she added something while you
  worked.
- **Add to `from_code.md`, newest entry on top**, under the header, with:
  ```
  ## YYYY-MM-DD HH:MM — <stage>: <one-line status>
  **Status:** spec ready | building | blocked | ready for sign-off
  **What changed:** …
  **Open questions:** … (or "none")
  **Sign-off checklist:** (on ready-for-sign-off entries)
  - [ ] item — where to find it
  Nothing has been published.
  ```
- Write an entry at the end of every stage that changes something (spec,
  blocked, ready for sign-off), not just at the end.
- Talk to her the way the studio's agent rules say: short, direct, no
  preamble.

## 1. Intake

1. If `podcast/episodes/epNN/` doesn't exist, copy
   `podcast/episodes/_template/` there and replace `{{N}}`/`{{NN}}`.
2. Find row N in `EPISODES.md`. If it's missing or unconfirmed, ask her
   which script and blog post belong to N, then add or update the row.
   Don't guess from titles.
3. Pull the script and blog post from Drive (Google Drive connector) into
   `copy/script.md` and `copy/blog_post.md`, **verbatim**.
4. **Footage.** Ask where episode N's footage is if `from_chat.md`
   doesn't say. If it isn't filmed yet, record intake as blocked in
   `from_code.md` and stop. Media goes in `epNN/media/`, which is
   gitignored and never committed (this repo is public).
5. **Transcribe** the raw recording with word timestamps into
   `media/transcripts/raw.txt` + `raw_words.json` (e.g. `pip install
   faster-whisper`). This is the source of truth for R6.
6. **Check for blockers** before writing the spec:
   - the blog post's Resources block is still a placeholder (R7 blocks the
     show notes, and only the show notes)
   - no "Stay ugly." take in the footage (blocks the outro)
   - first episode with no locked intro/outro yet (R4): sound design
     builds them in this run, and they need her approval

## 2. Spec (before any build work)

Fill in `epNN/spec.md`: intake facts, a section-by-section structure with
raw timecodes (trims and reorders only, with a reason for each cut),
deliverables, owner roles, role briefs drawn from the playbook, and the
verify plan. Fill in `manifest.json` with every planned path. Commit, add
a "spec ready" entry to `from_code.md`, then continue unless she has
written `HOLD`.

## 3. Build: five role sub-agents

Launch each role with the **Agent** tool (general-purpose). Use the order
the playbook gives. If it gives none, use:

1. **video edit**
2. **sound design**
3. **audio master**
4. **verticals** and **packaging**, in parallel (one message, two Agent
   calls)

Wait for each stage's handoff note before launching the next stage. Use
this prompt for every role, filling in the brackets:

```
You are the <ROLE> for The Ugly In Between, Ep <N>. Repo: /home/user/Code.
Episode folder: podcast/episodes/epNN/.

Your role brief, from podcast/PLAYBOOK.md (follow it exactly):
<paste that role's section verbatim>

Locked rules (podcast/RULES.md; these override the brief if they conflict,
and you flag the conflict rather than pick a side):
<paste the R1–R7 table and the intro/outro section verbatim>

Build to podcast/episodes/epNN/spec.md. Read manifest.json and the
handoff notes of the roles before you in roles/.

Hard limits:
- Never publish, upload, schedule or post anything anywhere.
- Her words only: you may order and trim her recorded speech. You may not
  add, paraphrase, re-record, generate or "clean up" any line, including in
  captions. Pauses, sighs and voice cracks stay.
- Media files go in media/ (gitignored); never commit them.
- Don't edit _inbox/from_chat.md. Don't write to _inbox/from_code.md; the
  orchestrator reports.

When done: update manifest.json for each deliverable you own (path,
transcript, captions as applicable), and write roles/<role>.md: what you
made, where it is, any deviation from the spec and why, open questions.
Run the verify script on your own outputs before you hand off:
python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/epNN
```

What each role produces, unless the playbook says otherwise:

| Role | Owns | Notes |
|---|---|---|
| video edit | `video_master` (picture + her dialogue), `video_master.txt` (built from the edit list's raw words), `video_master.srt` | B&W high-contrast. Every cut comes from `raw_words.json` timestamps. |
| sound design | theme edit, intro card, outro card, `music_stem` (full-length music bus aligned to the master), `cold_open` in the manifest | Theme = the locked Epidemic Sound recording. Cold open has no music at all. Intro follows the cold open. Theme comes in under her "Stay ugly." take. After the first sign-off, reuse the locked asset files exactly (R4). |
| audio master | `audio_master` and the final mix on `video_master`, both at −16 LUFS (R2) | One-pass `loudnorm` misses on short files. Measure, apply exact gain or use two-pass, then re-measure. |
| verticals | `vertical_NN` files: 1080×1920, captions burned in + `.srt`, −16 LUFS, a transcript each | Cut only from her words, and never from inside the cold open with music added. |
| packaging | `copy/show_notes.md`, titles, description, tags, thumbnail concepts | Show notes contain the blog's Resources block verbatim (R7). Quotes attributed to her are verbatim. No AI thumbnails. Eighties Comeback for thumbnail headlines. SEO follows `uglyinbetween.md`. |

## 4. Verify before you report

```
python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/epNN --frames
```

- Open each `media/verify_frames/*.jpg` and confirm captions are actually
  burned in and readable.
- Any **FAIL** goes back to the role that owns it, with the failing line.
  Re-run verify after each fix. Only report "ready for sign-off" on a
  report with zero FAILs.
- If a FAIL can't be fixed without breaking a rule (e.g. R7 with a
  placeholder Resources block), report it as **blocked**, name what you
  need from her, and deliver everything else.
- WARNs go in the report as they are. R4 "not locked yet" on the first
  episode is expected.

## 5. Report, then stop

1. Put the masters where she can review them: upload to Drive under the
   podcast's **Show Episodes → Long-Form / Short-Form** folders when the
   connector can take the file size. Otherwise say where they are and
   that the container is temporary.
2. Commit the repo-side files (spec, manifest, copy, roles notes,
   verify_report.md, EPISODES.md), never media, and push.
3. Add a "ready for sign-off" (or "blocked") entry to `from_code.md` with
   the verify summary, links, open questions, and the sign-off checklist:
   audio master, video master, each vertical, title + description, show
   notes, thumbnail concept, and on the first episode the intro/outro
   lock.
4. Tell her in two or three lines where it is and what needs her.
5. **Stop.** Nothing gets uploaded, scheduled, or posted, even after she
   signs off. She publishes.

## After sign-off

When `from_chat.md` has `SIGN-OFF: Ep N`:
- On the **first** signed-off episode only, write the theme, intro-card,
  and outro-card sha256 values from `verify_report.md` into
  `podcast/locked.json`, set `locked_on_episode`, and commit. From then
  on, R4 is a hard check.
- Log any new correction she gave during the episode in
  `brand-bible/CREATIVE_MEMORY.md`. If it's an editing rule, regenerate
  `agents/EDITOR_AGENT_PROMPT.md` (standing habit).
- Still don't publish.
