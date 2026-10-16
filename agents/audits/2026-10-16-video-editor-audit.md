# Video editor audit — 2026-10-16

**The finding:** the opening is where the edit loses people. Across every
retention curve available, almost everyone is still watching at ~4–5 s,
35–60% are gone by 9–15 s, and after ~30 s the curve barely moves. In all
four curves those seconds are a wordless morning-routine montage, which
is what the locked daily-vlog opening rules produce when applied to a
Short. Separately, Omnia has twice had to remove decoration the editor
added without being asked, which breaks a rule that is already locked.

No locked rule has been changed. The proposals below need her sign-off.

## What this is built on

| Source | What it gave | Limits |
|---|---|---|
| YouTube Analytics for @blkgrlco (via vidIQ), 2026-01-01 → 10-16 | Views, engaged views, average view %, per-video retention curves | Tiny samples: most videos have <50 views; the four curves rest on 90, 51, 35 and 17 engaged viewers. Day 35's curve came back empty (too few viewers). |
| vidIQ watch-throughs of 5 Shorts (Day 1, 2, 18, 35, 36) | Beat-by-beat first 20 s, cut counts, text, music | AI-estimated timings, not measured from the file. |
| Her revision notes in Drive copy files | Every change she asked for | Only 5 copy files still exist (Turkey, Vlog 13, 14, 32, Day 30); 4 record revisions. Copy files for Vlog 16, 17, 18 DIL, 21 DIL and Brazil Goals were in Drive earlier but now return "not found". |

Not done, and why:
- **Measured cut rhythm.** Masters are 80 MB–1 GB in Drive, and the
  Drive connector can't hand files that size to this session. Cut
  counts below are estimates.
- **Reference creators.** None were named for this run.
- **Diff of delivered cut vs. her final.** Only one version of each
  video exists in Drive, so the diff uses her written notes, not two
  files.

## 1. Edit diff: what she changed

From the 4 copy files with revisions (19 changes). Categories that recur
across videos:

| What she does | Videos | Count |
|---|---|---|
| Removes shots or lines (padding, repeats, other people) | Turkey, Vlog 14, Vlog 32 | 3 |
| Removes or sets rules for added sound (SFX, bleeps) | Turkey, Vlog 14, Vlog 13 | 3 |
| Removes decoration the editor added unasked (cards, route graphic, cha-ching, phone ring) | Turkey, Vlog 14 | 2 |
| Removes other people's voices | Vlog 14 (passenger), Vlog 32 (second voice) | 2 |
| Re-orders so the payoff comes first / matches real time | Turkey, Vlog 14 (hook now opens on the phone call) | 2 |
| Tightens pauses or moves a cut point | Turkey, Vlog 14 | 2 |
| Color / exposure | Turkey | 1 |

**Reversed after the editor did it unasked (3):** Turkey's travel cards,
route graphic and cha-ching ("Take it all out"); Vlog 14's phone-ring SFX;
Vlog 14's tail line, which the editor re-added after she had already cut
it, so she cut it twice.

**The hook note:** on Vlog 14 she re-cut the opening herself "after the
IG graph showed ~80% gone in 2 seconds," moving the stake (the four-hour
delay) to the first line. That's the same problem the YouTube curves show,
from a different platform.

## 2. Rhythm (estimated, not measured)

| Short | Length | Cuts (est.) | Avg shot (est.) | Opening |
|---|---|---|---|---|
| Day 1 | 2:14 | 47 | 2.8 s | "good morning" card → skincare montage 0–22 s, music, no speech |
| Day 2 | 2:34 | 27 | 5.5 s | silent 3 s → "Good morning." → silent skincare 5–20 s, no music |
| Day 18 | 1:48 | 28 | 3.7 s | "day 18 of 90" + outfit check → silent skincare 4–11 s |
| Day 36 | 0:49 | 13 | 3.5 s | "Now I got to go to work" (2 s) → skincare/meds montage 3–19 s |
| Day 35 | 1:15 | 31 | 2.3 s | "This is the state of my room. So, we have to clean it up." in 4 s |

Routine shots in these openings are estimated at ~1–1.5 s. The locked
rule says routine steps hold 2.5–3.5 s. If a measurement on the real file
confirms it, the cuts are running too fast to read. Flagged only.

## 3. Retention overlay

Share of starting viewers still watching (YouTube "audience watch ratio";
above 1.0 = rewatches):

| Short | ~4–5 s | ~9–15 s | ~30 s | end |
|---|---|---|---|---|
| Day 1 | 1.02 | 0.64 (13 s) | 0.24 (40 s) | 0.13 |
| Day 2 | 1.02 | 0.42 (15 s) | 0.22 | 0.14 |
| Day 18 | 1.00 | 0.43 (15 s) | 0.37 (32 s) | 0.11 |
| Day 36 | 1.18 | 0.41 (9 s) | 0.29 (24 s) | 0.18 |

- **Where:** the drop is the same in all four: after the first
  line/label, during the routine montage, before anything says what the
  day is about.
- **Not just normal swiping:** YouTube's relative retention compares each
  video to similar Shorts at the same moment. All four score well below
  typical in their first fifth (Day 18 sits around 0.05–0.10, where 0.5
  is typical).
- **Length isn't the lever:** across the 25 Shorts with ≥10 views, length
  has no relationship with share watched (rank correlation 0.01). Longer
  Shorts earn more seconds watched (0.49). About a third of views become
  engaged views, whatever the length (pooled 0.36).
- **Caveat:** nearly every Short opens on the routine, so "routine
  montage" and "first 15 seconds" can't be separated from this data
  alone. That's what the test below is for.

## 4. Findings → proposals

| # | Finding | Evidence | Proposal | Status |
|---|---|---|---|---|
| P1 | The vertical opening loses viewers before stating the day's stake | 4/4 curves + low relative retention + her Vlog 14 hook fix | For **Shorts only**: open on the day's stake in her own words from that day's footage (e.g. "Chicago's on a four-hour delay"), within 3 s; "good morning" and the routine come after. Long-form unchanged. | **Conflicts with a locked rule** ("Open every vlog on 'good morning'…"; Shorts = "condensed version of the whole vlog"). Needs her yes. |
| P2 | The editor adds decoration she didn't ask for | 2 videos, 3 reversals | No new rule: "Match her reference example exactly — no improvised… elements" is already locked. Process fix: before delivering, list every card, graphic and SFX that isn't in her reference and ask about it. | Process change; no rule change |
| P3 | A line she cut came back | Vlog 14 tail line, cut twice | Keep a per-video "her cuts" list in the copy file and check it before every re-cut. | Process change |
| P4 | She removes other people's voices | 2 videos | Candidate rule: drop third-party voices unless she asks to keep one. | At the 2-video threshold; her call |
| P5 | Routine shots may be faster than the locked 2.5–3.5 s | AI estimate only | Measure on the real files before acting. | Unverified |

## 5. Pre-registered prediction

Written 2026-10-16, before the next upload. Checked once a Short has ≥30
engaged views, or 7 days after publishing, whichever is later.

- **If the next Shorts keep the current opening:** share still watching
  at 15 s = **0.35–0.60**. Engaged/views = **0.25–0.45**. Average view %
  = **15–35%**.
- **If P1 is approved and used on the next 4 Shorts:** the median share
  at 15 s rises to **≥0.55**, and relative retention in the first fifth
  rises above **0.30**. Same thresholds, compared against the 4 baseline
  curves above. Only the opening changes (one variable).
- **Wrong if:** with P1, the 15 s share stays ≤0.45 on 3 of 4. Then the
  opening isn't the cause, and P1 gets dropped.
