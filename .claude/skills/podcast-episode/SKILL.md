---
name: podcast-episode
description: Run the full production chain for one filmed episode of the podcast I Wish Somebody Had Told Me (@iwishsomeonetoldme; formerly The Ugly In Between, @iwishsomeonetoldme): intake → implementation spec → build with five role sub-agents (audio master, sound design, video edit, vertical, packaging) → verify against the locked rules → report to the episode's _inbox, then stop before publishing. Use when Omnia invokes /podcast-episode <N>.
argument-hint: <episode number>
---

# /podcast-episode $ARGUMENTS

Episode **N = $ARGUMENTS**, folder `podcast/episodes/epNN/` (NN = N
zero-padded to 2 digits). If the argument isn't a whole number, stop and
ask for one.

The chain is fixed: **intake → spec → build → verify → report → stop.**
Don't skip a stage, don't reorder them, and never go past stop. It mirrors
her `/daily-vlog` flow.

## Read first, every run

1. **The playbook, live.** `podcast/PLAYBOOK.md` points to her Show Hub doc.
   Read its **Production System** tab (the five agents, standing rules,
   per-episode checklist) and its **Show Hub** tab (show format, locked
   episode structure, sign-off rule, clip rule, resources block, lineup)
   through the Claude Docs connector. Note the doc's `rev`. If the doc
   can't be read, stop and say so. Never work from memory or an old copy.
2. `podcast/RULES.md`: the locked rules R1–R7. If the doc's standing rules
   and RULES.md disagree, stop and flag it. Don't pick one.
3. `podcast/locked.json`, `brand-bible/brands/uglyinbetween.md` (voice;
   the identity is under review), and the corrections log in
   `brand-bible/CREATIVE_MEMORY.md`.
4. `podcast/_inbox/from_chat.md` (show-level decisions: where footage
   lives, how she reviews masters) and
   `podcast/episodes/epNN/_inbox/from_chat.md`, if it exists. Her newest
   notes win over anything older. A `HOLD` entry means stop after the spec.

## Inbox protocol

Each episode has `_inbox/from_chat.md` (hers: notes and decisions for
Code) and `_inbox/from_code.md` (yours: reports back). Pipeline-level
reports go in `podcast/_inbox/from_code.md`.

- **Never edit a `from_chat.md`.** Read it at the start of every run and
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
  Nothing has been published or sent to Drive, Rella or any platform.
  ```
- Write an entry at the end of every stage that changes something (spec,
  blocked, ready for sign-off), not just at the end.
- Talk to her the way the studio's agent rules say: short, direct, no
  preamble.

## 1. Intake

1. If `podcast/episodes/epNN/` doesn't exist, copy
   `podcast/episodes/_template/` there and replace `{{N}}`/`{{NN}}`.
2. Find episode N in the Show Hub's **Season 1 lineup**. If it isn't there,
   ask her. Don't guess. Update the snapshot row in `podcast/EPISODES.md`.
3. From the doc's **Scripts** and **Blog Posts** tabs, copy the `### Ep N —`
   section **verbatim** into `copy/script.md` and `copy/blog_post.md`.
4. Copy the blog post's **resources block** verbatim into
   `copy/resources_block.md`. It's the span from the first resource
   sentence (RAINN, a book like *Attached*, or "If you're looking for
   ongoing support…") through the 988 Lifeline sentence. In most posts it
   sits at the end of the "Let me be clear…" paragraph. Don't re-word,
   reorder or add anything.
5. **Footage** (see "Where things live" in `podcast/RULES.md`). Raw
   footage lives on her T7 SSD, which mounts as **Untitled**. She uploads
   episode N's files into this session. Find them among the session's
   uploads, copy them into `epNN/media/raw/`, and list each file (name,
   duration, size) in the spec. If nothing has been uploaded, ask her to
   upload episode N's footage from Untitled, then wait. If it isn't filmed
   yet, record intake as blocked in `from_code.md` and stop. Working media
   stays in `epNN/media/`, which is gitignored and never committed (this
   repo is public).
6. **Transcribe** the raw recording with word timestamps into
   `media/transcripts/raw.txt` + `raw_words.json` (e.g. `pip install
   faster-whisper`). This is the source of truth for R6.
7. **Check for blockers** before writing the spec:
   - a media-sparked episode (TV, podcast, book): note the source to credit
     in the description, and that no clip may appear anywhere
   - no sign-off take ("Signed, a ___" / "Stay ___") in the footage, which
     blocks the outro
   - first episode with no locked intro/outro yet (R4): sound design builds
     them in this run, and they need her approval

## 2. Spec (before any build work)

Fill in `epNN/spec.md`: the doc `rev` you built to, intake facts, the
section-by-section cut against the Show Hub's locked structure with raw
timecodes (trims and reorders only, with a reason for each cut),
deliverables, owner roles, the role briefs as the playbook words them, and
the verify plan. Fill in `manifest.json` with every planned path. Commit,
add a "spec ready" entry to `from_code.md`, then continue unless she has
written `HOLD`.

## 3. Build: five role sub-agents, in parallel where possible

Launch each role with the **Agent** tool (general-purpose). Run roles in
the same stage in parallel: one message, several Agent calls. Wait for a
stage's handoff notes before starting the next one.

| Stage | Roles | Why this order |
|---|---|---|
| 1 | **video edit** (picture cut) ∥ **packaging** (draft: title options, thumbnail concepts, show notes with sources + resources) | Packaging works from the script and blog, so it doesn't need the cut. |
| 2 | **sound design** | Needs the cut's timeline. |
| 3 | **audio master** ∥ **vertical** ∥ **video edit** (finish: final mix at −16 LUFS) | All three work from the designed mix. |
| 4 | **packaging** (final: chapters from the final timeline, long-form captions) | Needs final timings. |

If the playbook ever gives a different order, follow the playbook. Use
this prompt for every role, filling in the brackets:

```
You are the <ROLE> agent for the podcast I Wish Somebody Had Told Me,
Ep <N>. Repo: /home/user/Code. Episode folder: podcast/episodes/epNN/.

Your brief, from the playbook (Production System tab, rev <REV>), verbatim:
<paste that agent's section>

Show rules, from the Show Hub, verbatim:
<paste "Locked structure, every episode", "Sign-off rule", "Language",
 "Clips", and the media-sparked premise line>

Locked rules (podcast/RULES.md; these override the brief if they conflict,
and you flag the conflict rather than pick a side):
<paste the R1–R7 table, the intro/outro section, and the show rules>

Build to podcast/episodes/epNN/spec.md. Read manifest.json and the
handoff notes in roles/ from the roles before you.

Hard limits:
- Never publish, upload, schedule or post anything anywhere. Never write to
  Google Drive, Rella or any other platform.
- Her words only: you may order and trim her recorded speech. You may not
  add, paraphrase, re-record, generate, censor, bleep or "clean up" any
  line, including in captions.
- Never show a TV/podcast/book clip in any version. The scene is described
  in her words.
- Media files go in media/ (gitignored); never commit them.
- Don't edit any _inbox/from_chat.md. Don't write to _inbox/from_code.md;
  the orchestrator reports.

When done: update manifest.json for each deliverable you own (path,
transcript, captions as applicable), and write roles/<role>.md: what you
made, where it is, any deviation from the spec and why, open questions.
Run the verify script on your own outputs before you hand off:
python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/epNN
```

What each role owns in the manifest. The briefs themselves come from the
playbook.

| Role | Owns | Mechanics the brief doesn't spell out |
|---|---|---|
| video edit | `video_master` (YouTube long-form): picture, her dialogue, final mix at −16 LUFS; `video_master.txt` (built from the edit list's raw words) | Every cut comes from `raw_words.json` timestamps. B-roll and punch-ins never introduce a media clip. |
| sound design | theme edit, intro card, outro card, `music_stem` (full-length music bus aligned to the long-form), `cold_open` times in the manifest | Theme = the locked Epidemic Sound recording. Cold open dry. Theme under her sign-off, then a cold end. After the first sign-off, reuse the locked files exactly (R4). |
| audio master | `audio_master`: MP3, stereo, −16 LUFS, ID3 album = show name, track = episode number, title, disc = season | **Measure the final MP3, not the WAV.** MP3 encoding moved loudness about 0.5 LU in testing. One-pass `loudnorm` also misses on short files. Measure, apply exact gain, encode, re-measure. |
| vertical | 2–3 `vertical_NN` files: 9:16, captions burned in + `.srt`, −16 LUFS, a transcript each | The most quotable, self-contained moments, cut only from her words. |
| packaging | `copy/titles.md`, `copy/thumbnail.md` (concepts), `copy/show_notes.md` (sources + resources + chapters), `video_master.srt`, the clip credit in the description | Show notes include `copy/resources_block.md` verbatim (R7). Quotes attributed to her are verbatim. No AI thumbnails. The thumbnail look and font are under review, so propose and don't assume. Never use the retired name "The Ugly In Between". |

## 4. Verify before you report

```
python3 .claude/skills/podcast-episode/scripts/verify.py podcast/episodes/epNN --frames
```

- Open each `media/verify_frames/*.jpg` and confirm captions are actually
  burned in and readable, and that no frame shows a TV/media clip.
- Any **FAIL** goes back to the role that owns it, with the failing line.
  Re-run verify after each fix. Only report "ready for sign-off" on a
  report with zero FAILs.
- If a FAIL can't be fixed without breaking a rule, report it as
  **blocked**, name what you need from her, and deliver everything else.
- WARNs go in the report as they are. R4 "not locked yet" on the first
  episode is expected.

## 5. Report, then stop

1. **Hand the masters to her, not to a platform (R1).** Send every final
   file in `epNN/media/out/` (`EpNN_*`: the MP3, the long-form, each
   vertical, the SRTs) with **SendUserFile** (`display: "attach"`) so she
   can save them to **Untitled** (her T7). That's how masters land on the
   T7, and it's delivery to her, not publishing. Tell her plainly: **this
   cloud session's files disappear when it ends, so save them to Untitled
   now.** If a file is too big to send, say which one and keep the
   session's copy until she confirms she has it. Nothing goes to Drive,
   Rella or any platform.
2. Commit the repo-side files (spec, manifest, copy, roles notes,
   verify_report.md, EPISODES.md), never media, and push.
3. Add a "ready for sign-off" (or "blocked") entry to the episode's
   `from_code.md` with the verify summary, paths, open questions, and the
   playbook's per-episode checklist as the sign-off checklist:
   - [ ] audio mastered to −16 LUFS, MP3 + ID3 tags
   - [ ] intro/outro laid, cold open dry
   - [ ] YouTube long-form cut, −16 LUFS, captioned
   - [ ] 2–3 verticals cut, 9:16, captioned
   - [ ] title + thumbnail
   - [ ] show notes written (sources, resources, chapters)
   - [ ] blog post ready for Substack + website (her text from the doc,
     unchanged)
   - [ ] on the first episode: the intro/outro lock
   - [ ] Omnia signed off → then she publishes
4. Tell her in two or three lines where it is and what needs her.
5. **Stop.** Nothing gets uploaded, scheduled or posted, and nothing goes
   to Drive or Rella. She publishes to YouTube, TikTok, Reels, Spotify for
   Creators, Substack and her website.

## After sign-off

When the episode's `from_chat.md` has `SIGN-OFF: Ep N`:
- If the sign-off entry asks for it, copy the approved files to the Drive
  folder it names, and nothing else. Without that request, nothing goes
  to Drive.
- On the **first** signed-off episode only, write the theme, intro-card
  and outro-card sha256 values from `verify_report.md` into
  `podcast/locked.json`, set `locked_on_episode`, and commit. From then
  on, R4 is a hard check.
- Log any new correction she gave during the episode in
  `brand-bible/CREATIVE_MEMORY.md`. If it's an editing rule, regenerate
  `agents/EDITOR_AGENT_PROMPT.md` (standing habit). If it changes how the
  pipeline works, suggest the edit to her Production System tab instead
  of writing it only here, because the doc is the source of truth.
- Still don't publish.
