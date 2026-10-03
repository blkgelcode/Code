# I Wish Someone Had Told Me: from code (show level)

Code's reports on the pipeline itself. Newest entry on top, dated.
Episode reports go in `podcast/episodes/epNN/_inbox/from_code.md`.

---

## 2026-10-03 18:37 — setup: skill scaffolded, 6 questions open

**Status:** scaffolded; blocked on the playbook (Q3).

**What changed:**
- `/podcast-episode <N>` is in `.claude/skills/podcast-episode/`. It runs
  intake → spec → build (five role sub-agents) → verify → report here →
  stop. It never publishes.
- The seven rules are locked in `podcast/RULES.md`:
  - **R1** nothing publishes, and nothing goes to Drive, Rella or any
    platform, without your sign-off
  - **R2** −16 LUFS on audio and video
  - **R3** the cold open stays music-free
  - **R4** one consistent intro/outro across every episode
  - **R5** captions on every video and vertical
  - **R6** your words only: I order and trim, never rewrite
  - **R7** show notes reuse the blog post's Resources block
- `verify.py` checks R2–R7 before anything gets reported. It was tested on
  a synthetic episode: a clean one passed, and a broken one failed on
  every rule that was broken.
- R1 is enforced three ways. The skill won't write to Drive or Rella before
  a `SIGN-OFF: Ep N` line exists. Publishing tools are denied in
  `.claude/settings.json`. Drive and Rella write tools ask for your
  approval every time.
- **Changed today:** the skill used to upload masters to Drive for you to
  review before sign-off. That broke R1, so it's gone. Masters now stay
  in the episode's `media/` folder (see Q1).

**Already answered (from the earlier interview):**
- Footage: not filmed yet.
- Outputs: this repo (`podcast/`). Media is gitignored because the repo
  is public.
- Intro/outro music: "I Deserve Better (Instrumental Version)", spring
  gang (Epidemic Sound), comes in under your own "Stay ugly." take.
- Inbox: this newest-first log. Episode numbers: `podcast/EPISODES.md`.

**Open questions** (answer in `podcast/_inbox/from_chat.md`):

1. **Where do you review masters before sign-off?** Masters can't go to
   Drive before sign-off (R1) and can't be committed to a public repo. A
   cloud session's files disappear when the session ends.
   - a) **Run the skill on your computer** (linked session), so masters
     land on the T7 SSD next to the footage. *Recommended. It matches
     how your other footage is stored.*
   - b) **Cloud session.** I tell you the paths, and you download before
     the session ends. Fragile.
   - c) **Allow review copies on Drive.** Write a standing exception
     here, e.g. "review copies may go to Drive folder X before sign-off."
     Drive still chokes on large files.
2. **Where will the footage live once it's filmed?** I suggest the T7 SSD,
   one folder per episode (e.g. `podcast/ep00/`), following the
   `project hhh` pattern. Confirm or give the path.
3. **The playbook.** It defines the five roles (audio master, sound
   design, video edit, verticals, packaging). Paste it or send the link.
   The skill refuses to run a role that has no section in it.
4. **New handle and brand hashtag.** @uglyinbetween stays everywhere,
   including Metricool, until you give them.
5. **Ep 0's Resources block** is still a placeholder ("[name the specific
   resources here…]"). Ep 0's show notes are blocked until it's filled in
   (R7).
6. **"Someone" or "Somebody"?** Your Drive bible is titled "I WISH
   SOMEBODY HAD TOLD ME". Everything here says "Someone".

**Sign-off checklist:** nothing to sign off yet. Nothing has been
published, and nothing was sent to Drive, Rella or any platform.
