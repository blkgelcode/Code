# Podcast editor audit — I Wish Somebody Had Told Me — 2026-10-16

**The finding:** the scripts are sound. All 11 follow the locked
structure in order, and every one speaks LifeStance and 988 out loud. The
risk is in the edit pipeline, which left three things your playbook
requires unchecked, and one decision unmade:
- **Unmade:** where the cold open ends. No script marks it, and it's
  where the locked intro lands and where the music-free window stops.
- **Unchecked:** whether the close (disclaimer → resources → "Signed" →
  "Stay") survives the cut, whether media-sparked episodes credit their
  source, and whether the show notes have valid chapters.

All of these are now fixed in the pipeline and tested. No locked rule
changed.

## What this is built on, and what doesn't exist yet

The show hasn't filmed or published, so the rawest material is her
writing.

| Source | Status |
|---|---|
| 11 scripts, Show Hub doc Scripts tab (rev 5) | Copied verbatim and measured with code |
| Playbook (Production System tab), Show Hub rules | Checked line by line against the pipeline |
| Footage, published episodes, retention, her revision notes on an episode | **None yet.** The podcast channel isn't connected to vidIQ (only @blkgrlco and @blkgrlcotoo are), so there's no audience data to read. |

## 1. Script measurements

Timings assume **150 words per minute**, a placeholder until Ep 1's real
footage gives her actual pace.

| Ep | Words | ~Runtime | Opening line | Advice | Close starts | Sign-off |
|---|---|---|---|---|---|---|
| 0 | 409 | 2.7 min | "This year cracked me open." | 0:19 | 1:37 | Signed, the kid who didn't have the words. / Stay looking for yours. |
| 1 | 817 | 5.4 min | "Escapism is my favorite drug." | 3:57 | 4:36 | Signed, an escape artist. / Stay gone as long as you need to… |
| 2 | 630 | 4.2 min | "Picture this." (28-word paragraph) | 2:02 | 3:26 | Signed, an eldest daughter. / Stay the kid. |
| 3 | 718 | 4.8 min | "I want to talk about how 'no' gets trained out of a child." | 3:32 | 4:01 | Signed, a good child. / Stay hard-headed. |
| 4 | 724 | 4.8 min | "There's a quote Ted Lasso throws up on the screen." (44 words) | 3:20 | 4:03 | Signed, a procrastinator. / Stay scared, and do it anyway. |
| 5 | 867 | 5.8 min | "My story isn't special." | 4:14 | 5:02 | Signed, 12-year-old me. / Stay telling, when you're ready. |
| 6 | 743 | 5.0 min | "You are a disappointment." | 3:16 | 4:12 | Signed, a recovering disappointment. / Stay reaching. |
| 7 | 687 | 4.6 min | "I ghosted therapy." | 3:05 | 3:45 | Signed, someone who finally asked for help. / Stay talking… |
| 8 | 616 | 4.1 min | "I love love." | 2:34 | 3:06 | Signed, a fearful avoidant. / Stay scared, and leave love on the list. |
| 9 | 582 | 3.9 min | "I am the president of the wannabes." | 1:42 | 3:06 | Signed, a wannabe. / Stay wanting — just do one of them. |
| 10 | 511 | 3.4 min | "Healing isn't the before and after." | 2:11 | 2:37 | Signed, someone learning to sit still. / Stay in the gray. |

"Advice" is the first "So here's…" / "So this is…" line (a pattern
match, so approximate). "Close starts" is the "not a therapist"
disclaimer. In 9 of 11 it shares a paragraph with the spoken resources
(Ep 0 and Ep 5 keep them apart). From disclaimer to sign-off runs about
40–60 s in every episode.

**What holds across all 11:**
- **Locked order holds:** story → advice → disclaimer → resources →
  "Signed, a ___" → "Stay ___" → `(cold end)`.
- **Resources:** LifeStance and 988 are spoken in every episode. RAINN is
  added in Ep 5, *Attached* in Ep 8.
- **Variations the editor must not "fix":**
  - **Ep 5:** "It's okay to tell" instead of "It's okay to ask for help."
    Deliberate, for the abuse episode.
  - **Ep 0:** a stylized cold open (handwriting, voiceover), and its
    disclaimer reads "Now, I need to be clear…", not "Let me be clear."
  - **Ep 4:** `(Riff here if more comes up in the room. Let it breathe.)`.
    Don't tighten that stretch.
- **Open item inside a script:** Ep 2's scene list says "lines 2–4 matched
  to scenes by video order, so check them." That needs her before Ep 2 is
  cut.

## 2. Pipeline against the playbook

| Playbook / Show Hub requirement | Before today | Now |
|---|---|---|
| Locked structure survives the cut (disclaimer, resources, Signed, Stay) | Not checked | `verify.py`: each line found in one stretch of each master transcript, in order. Passes on all 11 real scripts; catches a missing or reordered line. |
| Credit the show / fan edit / book (media-sparked Ep 2, 4, 8) | Not checked | Intake lists `credits` from the script's Source line; `verify.py` fails if any is missing from the description |
| Show notes have chapters | Not checked | `verify.py`: ≥3, starts at 0:00, ≥10 s apart, inside the video |
| Where the cold open ends / intro lands | Left to the editor, never recorded | Spec must name the exact line and reason; first item in "spec ready" and on the sign-off checklist |
| Script stage directions (e.g. Ep 4's riff) | Not carried into the edit | Copied into the spec as editor instructions |
| Thumbnail; audio "cleaned (noise, clicks)" | Not checked | **Still not checked.** Needs real footage to set a sensible threshold. |

## 3. Carried over from the editor's track record

Same editor, other show, and not a podcast rule. On the daily vlogs, every
change she reversed was something the editor added unasked (cards, a
route graphic, two SFX). One was a line she'd already cut that came back.
The podcast playbook allows "any light bed under sections," which is the
same opening for unasked additions. So every role now:
- adds nothing outside the script, playbook or spec;
- lists any idea as "proposed, not added" for her to approve;
- checks a "her cuts" list before every re-cut.

## 4. Pre-registered predictions

Written 2026-10-16, before anything is filmed. **To check these, the
@iwishsomeonetoldme YouTube channel has to be connected in vidIQ.**

1. **Her real pace will differ from 150 wpm by more than 10%.** Check: Ep
   1's raw transcript (words ÷ minutes of speech). If it lands within
   135–165, the timings above stand.
2. **Ep 1's steepest retention drop will be in its first 30 seconds,**
   before the intro card ends. Check: the YouTube retention curve once Ep
   1 has ≥30 engaged views. Wrong if the steepest 10-second drop is later.
3. **No single 10-second drop of more than 10 points inside the
   disclaimer-plus-resources block** (Ep 1, about 4:36–5:20). Wrong if
   there is one. That would mean the block needs its own treatment, which
   only she can decide.
