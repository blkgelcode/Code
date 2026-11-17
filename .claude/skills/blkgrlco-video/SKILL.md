---
name: blkgrlco-video
description: Run the @blkgrlco video production team on one video (daily short, daily vlog, Sunday vlog, 90-Day HHH Run episode, explainer) — intake → spec → build with nine role agents (scriptwriter, colorist, editor, graphics, sound, shorts, thumbnail, packaging, QC) → verify against blkgrlco/RULES.md → report, then stop before publishing. Use when Omnia invokes /blkgrlco-video <slug> or hands over @blkgrlco footage, a script or a VO to produce.
argument-hint: <slug, e.g. hhh-day90-finale>
---

# /blkgrlco-video $ARGUMENTS

Video **slug = $ARGUMENTS**, folder `blkgrlco/videos/<slug>/`. The slug is
lowercase words joined by `-`. If none is given, propose one from the
topic and confirm it with her.

You are the **producer**. You run the chain, brief the role agents, and
are the only one who talks to her. The chain is fixed:
**intake → spec → build → verify → report → stop.** Don't skip or reorder
stages, and never go past stop.

## Read first, every run
1. `blkgrlco/RULES.md`: the locked rules. Everything is built and verified
   to these.
2. `brand-bible/brands/blkgrlco.md`, the corrections log and "Retired"
   table in `brand-bible/CREATIVE_MEMORY.md`, and `agents/AGENTS.md`'s
   shared rules.
3. `blkgrlco/videos/<slug>/_inbox/from_chat.md` if it exists. Her newest
   note wins. `HOLD` means stop after the spec.

Talk to her the studio way: short, direct, no preamble. Confirm the brand
and platform before producing anything. If the material is actually for
@blkgrlcotoo or the podcast, stop and say so (the podcast has
`/podcast-episode`).

## The team

Each role is a project agent in `.claude/agents/`. Launch it with the
**Agent** tool, `subagent_type: "blkgrlco-<role>"`. If those types aren't
loaded (agent files added mid-session load on the next session), use
`general-purpose` and paste the role file's contents into the prompt.

| Role | Agent | Owns |
|---|---|---|
| Scriptwriter | `blkgrlco-scriptwriter` | script, VO script, shot list + thumbnail shots |
| Colorist | `blkgrlco-colorist` | graded working files (conversion LUT → Everyday LUT), before/after stills |
| Editor | `blkgrlco-editor` | picture cut, `copy/edl.md`, master transcript, shot map |
| Graphics | `blkgrlco-graphics` | label cards, overlays, 4-panel grid |
| Sound | `blkgrlco-sound` | VO cleanup, music/SFX, final mix, cue sheet |
| Shorts | `blkgrlco-shorts` | Shorts cut < 3:00, captions |
| Thumbnail | `blkgrlco-thumbnail` | concepts, real-frame thumbnails in Advercase |
| Packaging | `blkgrlco-packaging` | titles, description + chapters, platform captions |
| QC | `blkgrlco-qc` | verify run, frame review, pass/fail per rule |

Run only the roles the job needs. A script-only request gets the
scriptwriter. A VO track to master gets sound. The full chain runs when
she hands over footage to build out end to end (PRODUCTION_WORKFLOW
shortcut rule).

## 1. Intake
1. If the folder doesn't exist, copy `blkgrlco/videos/_template/` there and
   replace `{{SLUG}}`. Add a row to `blkgrlco/VIDEOS.md`.
2. Pin down: type, lane/series, platforms, the one-line central topic, the
   **reference to match** (C12; "Day1of90" for the HHH Run), and the
   **music picked before shooting** (D1). Ask for whatever is missing in
   one question, not several.
3. **Material.** Footage, VO, scripts and production docs come in as
   session uploads (her T7 `project hhh/<video>/` folder). Copy media into
   `media/raw/` (gitignored). List every file in the spec (name, duration,
   size, resolution, log or not). Skip corrupt and accidental-trigger
   clips and list them (P5). Nothing uploaded → ask, then wait.
   Production docs she supplies (scripts, shot lists) go in
   `media/docs/`, **not** `copy/`, if they hold anything she wouldn't
   publish (health, family, therapy details). This repo is public.
4. **Transcribe** every clip with dialogue into `media/transcripts/` with
   word timestamps (`pip install faster-whisper`). If the model download
   is blocked by the network, don't invent a transcript: say so, ask her
   to allow `huggingface.co` for this environment (read the environment
   docs and propose it per their steps), and carry on with what doesn't
   need words.
5. **Blockers to check now:** no reference for a new format (C12) · no
   pre-picked music (D1) · VO with AI placeholder lines (lines she still
   has to record) · a CTA that conflicts with the locked one (T6) · a
   source doc that conflicts with RULES.md. Flag each. Don't resolve them
   yourself.

## 2. Spec
Fill in `spec.md` and `manifest.json`: structure with raw timecodes and a
reason for every cut, deliverables, owners, blockers, verify plan. Commit
the repo-side files (never media) and add a "spec ready" entry to
`_inbox/from_code.md`. Continue unless she wrote `HOLD`.

## 3. Build
Run roles in the same stage in parallel (one message, several Agent
calls). Wait for every handoff in `roles/` before starting the next stage.

| Stage | Roles | Why |
|---|---|---|
| 1 | scriptwriter (if no script/shot list) ∥ colorist ∥ thumbnail (concepts in words) | Grading needs only raw footage. Concepts need only the topic. |
| 2 | editor ∥ graphics | The cut needs graded footage. Cards need the scene list from the spec. |
| 3 | sound | Needs the cut's timeline. |
| 4 | shorts ∥ packaging ∥ thumbnail (build) | All work from the mixed master. |
| 5 | qc | Last, always. |

Brief every role with this prompt, filling the brackets:

```
You are the <ROLE> on the @blkgrlco video team. Repo: /home/user/Code.
Video folder: blkgrlco/videos/<slug>/. Type: <type>. Lane/series: <…>.
Reference to match: <…>. Build to spec.md; read manifest.json and the
roles/*.md handoffs before you. Her notes this run: <from_chat summary,
verbatim where it matters>. Blockers already flagged: <…>.
Your task this stage: <specific task>.
```

## 4. Verify
```
python3 .claude/skills/blkgrlco-video/scripts/verify.py blkgrlco/videos/<slug> --frames
```
QC runs it and reviews the frames. Every **FAIL** goes back to the owning
role with the failing line. Re-run after each fix. "Ready for sign-off"
needs zero FAILs. A FAIL that can't be fixed without breaking another
rule is **blocked**: name what's needed from her. WARNs go in the report
as they are.

## 5. Report, then stop
1. Send every deliverable in `media/out/` with **SendUserFile**
   (`display: "attach"`) so she can save them to her T7. Tell her plainly
   that this cloud session's files disappear when it ends, so she should
   save them now. If a file is too big to send, say which one.
2. Commit the repo-side files (spec, manifest, copy/, roles/,
   verify_report.md, VIDEOS.md), never media, and push.
3. Add a "ready for sign-off" (or "blocked") entry on top of
   `_inbox/from_code.md`:
   ```
   ## YYYY-MM-DD HH:MM — <stage>: <one-line status>
   **Status:** spec ready | building | blocked | ready for sign-off
   **What changed:** …
   **Open questions:** … (or "none")
   **Sign-off checklist:**
   - [ ] master — 1080×1920 / long-form, graded (conversion → Everyday LUT)
   - [ ] Shorts cut < 3:00
   - [ ] label cards on every scene change
   - [ ] thumbnail (real frame, Advercase) + title, phrases split
   - [ ] description with chapters, hashtags, platform captions
   - [ ] her preflight.py run on the Mac
   - [ ] Omnia signed off → then she publishes
   Nothing has been published, scheduled or sent to any platform.
   ```
4. Tell her in two or three lines where it is and what needs her.
5. **Stop.** Nothing gets uploaded, scheduled or posted, and nothing goes
   into Metricool. She publishes.

## After sign-off
When `from_chat.md` has `SIGN-OFF: <slug>`:
- Update `blkgrlco/VIDEOS.md`.
- Log new corrections she gave in `brand-bible/CREATIVE_MEMORY.md`. A
  correction becomes a rule only when she says so or it recurs. If an
  editing rule got locked, update `blkgrlco/RULES.md` and regenerate
  `agents/EDITOR_AGENT_PROMPT.md` (standing habit).
- Still don't publish.
