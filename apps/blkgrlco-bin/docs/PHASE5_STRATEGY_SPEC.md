# Phase 5: Strategy tab

Received 2026-10-26. Built 2026-10-27 after Omnia said "Go on all phases" (code: `blkbin/strategy.py`,
`web/strategy.js`, tests in `tests/test_phase5.py`). How each open question below was handled is in
"How it was built" at the end.

## Shared rules (as given)

- Data: YouTube Data API, plus TubeLab outlier search if connected.
- Only videos from the last 12 months. Every number links to its source video.
- Outlier score = the video's views ÷ the median views of its channel's last 30 uploads.
  (TubeLab measures outliers against a channel *average*, so the app recomputes every score
  with this definition, so all numbers use the same yardstick.)
- Audience per channel: @blkgrlco → Nia · @blkgrlcotoo → Zara · podcast → Amara.

## 1. Audience Bullseye

- Load saved profiles (Nia / Zara / Amara). Ask only about what's missing: goals, what they've
  tried, where they watch. Never overwrite a profile without her yes.
- 10–15 channels per lane, favoring under 100K subscribers with high average views.
- Their outliers (3x+), grouped into topic buckets.
- Topic score out of 16 = 4 parts × 4 points: audience fit · demand (outlier count) ·
  competition gap · fit with what she can film Thu–Sat.
- Bullseye chart (center = best) + ranked list tagged Top / Middle / Bottom of funnel.
- Button: send a topic to the dashboard idea bank (through the Phase 2 `bin-export.json` path).

## 2. Hook Machine

- Top outliers in her lanes: first-5-seconds transcript, frames at 0s and 2s, title, thumbnail.
- Reusable skeletons (e.g. "[number] [adjective] [things] that [result]"), each with: outlier count,
  median outlier score, 3 example videos.
- "Generate hooks": skeleton + one of her project ideas → 5 variations in her voice. Casual lowercase,
  one sentence, opinion + curiosity, passes "Would Nia stop scrolling?". @blkgrlco dailies and
  long-forms also apply the Oct 21 outlier-study hook/title rules. The 90-Day run keeps "Day N of 90";
  open-ended series use the "until" format.
- Approved hooks save to the project's Plan tab.

## 3. Channel Audit (merged with the Phase 4 retention loop)

- Last 50 uploads per channel. Above-median vs below-median videos compared on topic, format
  (talking head / vlog / montage), hook skeleton, story structure (follows the 5-line story map
  B1–B5 from the dashboard?), retention at 30s.
- Output: named patterns with a template and 2 of her own videos as proof.
- Re-runs every Sunday after the weekly long-form posts.

## Testing (as given)

- Bullseye on @blkgrlco only first; show the top 10 topics with sources.
- Hook Machine: take 5 hooks from one of her past videos and score the skeleton each used against
  that video's actual 3-second hold rate.

## Notes from Claude: what each part needs

| Item | Status | Notes |
|---|---|---|
| Nia / Zara / Amara profiles | **Missing** | Not in this repo. Need to know where they're saved. |
| Oct 21 outlier-study hook/title rules | **Missing** | Not in this repo. Possibly the "Watch Time + Thumbnails Plan" artifact (Oct 22); need confirmation. |
| 5-line story map | Found | The dashboard's STORY template: B1 hook, B2 stakes, B3 middle, B4 turn, B5 cold end. |
| Thu–Sat filming days | Noted | Not in the brand docs yet; will be added when built. |
| Frames at 0s/2s of *other creators'* videos | **Problem** | The YouTube API gives titles, thumbnails and stats, not video frames. Getting frames means downloading their videos, which YouTube's terms don't allow. Proposal: for other channels use title + thumbnail + first-5s transcript; use frames only for her own videos (from the T7 masters). |
| Transcripts of other creators' videos | Partly | The YouTube Data API only downloads captions for your own videos. TubeLab has a transcript tool, but it's connected to Claude, not to the local app; the app would need TubeLab's own API access (to check), or Claude runs that step in a session and saves the results for the app. |
| 3-second hold rate | Partly | YouTube Analytics retention comes in steps of 1% of the video's length (about 6s for a 10-minute video), so an exact 3s hold only exists for Shorts. For long-forms, use the "At 0:03" numbers the dashboard already has from vidIQ where present. |
| Retention at 30s, last 50 uploads | OK | YouTube Analytics API with her OAuth (from Phase 3). Each channel, the podcast included, needs its own sign-in. |
| API quota | OK with caching | The YouTube Data API allows 10,000 units a day; one search costs 100. Finding channels for 3 lanes fits in a day if results are cached. |
| Sunday auto re-run | OK if the Mac is on | A scheduled background job; it catches up on the next start if the Mac was asleep. |

## How it was built (2026-10-27)

- **Profiles and rules:** not found anywhere, so the app has a Profiles & rules sub-tab. Missing answers are flagged
  (goals, what she's tried, where she watches, as the spec says to ask). Saves that would replace a saved answer
  stop and show old → new until she clicks "Yes, replace".
- **Lanes:** the Bullseye searches YouTube (videos from the last 12 months) for each "search lane" in the profile,
  plus the channels she says the audience already watches. A "lane" in "10–15 channels per lane" is the audience
  (Nia's lane), not each search phrase.
- **Topic score:** audience fit and Thu–Sat filmable are Claude's 0–4 calls, with the reason shown on hover. Demand
  is the outlier count (1 → 1 point, 2–3 → 2, 4–6 → 3, 7+ → 4). Competition gap is the share of the topic's
  outliers that come from channels under 100K subscribers (≥75% → 4, ≥50% → 3, ≥25% → 2, any → 1).
- **Other creators' frames and transcripts:** not downloaded. Hook Machine uses titles, thumbnails and pasted (or
  TubeLab-imported) opening lines. TubeLab isn't wired into the app directly.
- **Story map B1–B5:** judged only when the project has a script in the Plan tab; otherwise "unknown".
- **Format:** taken from the project's clip order (talking head ≥ 60% of the time → talking head; b-roll/photos ≥ 60% →
  montage; else vlog) when the video is linked to a plan, otherwise Claude's guess from the title (labelled as a guess).
- **3-second hold:** read from the retention curve; exact for videos under 5 minutes, interpolated between 1% steps
  for longer ones (the table says which).
- **Sunday re-run:** every Sunday after 18:00 (Settings `audit_hour`), or at the next start if the Mac was off.
