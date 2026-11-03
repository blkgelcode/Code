# BLKGRLCO Studio OS

One home for the creator business, running on your Mac. It's eight open-source
tools that replace eight subscriptions, plus one page at **http://localhost:4000**
to open them all and check that they're healthy.

Each tool stays its own separate program. Nothing is merged, so each one can be
updated, removed or swapped without touching the others.

---

## Read this first: four things to decide

These came up while checking each project (November 2026). None of them block the
install, but you should know about them.

1. **OpenHiggsfield has no license file.** Legally, that means "all rights reserved".
   It's also a front end for Higgsfield's *own* paid API, not a local generator. So it
   replaces the Higgsfield **subscription**, but you still pay Higgsfield for each
   generation. The fallback, **Open Generative AI**, is MIT-licensed and works the same
   way through MuAPI. `install.sh` asks before installing OpenHiggsfield. To switch,
   set `COMPOSE_PROFILES=open-generative-ai` in `.env` and run `./install.sh video`.
2. **Cal.com's open-source version is now "Cal.diy".** `calcom/cal.com` now redirects
   to `calcom/cal.diy`. It's a community edition with Teams, Workflows and other paid
   features removed, and the project says it's meant for personal use. The code is
   still updated daily, but the newest ready-made Docker image is **v6.2.0 from March
   2026**, eight months old. That's fine for booking calls. If it bothers you, Cal.com's
   free hosted plan is the alternative.
3. **Brands can't reach your Mac by default.** Everything listens only on your own
   computer. For a brand to open your booking link or use the chat on your website,
   turn on the free Cloudflare Tunnel (see
   [Letting brands book you](#letting-brands-book-you)), and keep the Mac awake.
4. **No Mac can generate video locally with these tools.** Every video job goes to a
   paid cloud API. Voice (VoiceStudio) and dictation (OpenWhispr) do run fully on
   your Mac.

All 8 repos were checked: none is archived or a fork, and all have commits from the
last two months. Details are in `SETUP_LOG.md`.

---

## The tools

| # | Tool | Replaces | Runs as | Address | About per month |
|---|------|----------|---------|---------|-----------------|
| 1 | **OpenHiggsfield**: AI image and video | Higgsfield ($15–$129/mo plans) | Docker | localhost:4101 | Pay per clip: about $0.67 for an 8-second Kling 3.0 clip at 720p. Light use is roughly $5–$40 |
| 2 | **VoiceStudio**: voice cloning, voice design, dubbing | ElevenLabs | Mac app | (engine on :3900) | **$0** (runs on your Mac) |
| 3 | **OpenSEO**: keywords, rank tracking, audits | Semrush | Docker | localhost:4102 | DataForSEO pay-as-you-go: about $0.03–$0.05 per keyword search, so usually $2–$10. You pay a **$50 minimum top-up** once, and it never expires |
| 4 | **AppFlowy**: docs, databases, boards | Notion | Mac app | – | **$0** |
| 5 | **OpenWhispr**: talk-to-type dictation | Wispr Flow | Mac app | – | **$0** with local models (cloud transcription is optional) |
| 6 | **Cal.com**: booking links for brand-deal calls | Calendly | Docker | localhost:4103 | **$0** |
| 7 | **Chatwoot**: one inbox for brand and collab messages | Intercom | Docker | localhost:4104 | **$0** |
| 8 | **Cap**: screen and camera recording | Loom | Mac app | – | **$0** for recording and exporting locally |

**Typical total: about $5–$15 a month, plus whatever video you generate.** Add the
one-time $50 DataForSEO top-up. Optional extras are free (Resend email, Cloudflare
Tunnel), apart from a domain (about $10 a year) if you want public booking links.
Your Mac's electricity is the rest.

The hub is at **localhost:4000** and has five tabs: **Create** (video, voice, record),
**Write** (AppFlowy, dictation), **Grow** (SEO), **Business** (Cal.com, Chatwoot) and
**Status** (health of every tool, disk use, missing keys).

---

## Install (about 30–45 minutes, mostly downloads)

```bash
# 1. Put the kit at ~/studio-os (or run install.sh from the repo; it offers to link it)
cp -R studio-os ~/studio-os && cd ~/studio-os

# 2. Phase 0 only: check the Mac, install nothing
./preflight.sh

# 3. Everything, one tool at a time
./install.sh
```

What `install.sh` does, in order:

1. **Phase 0.** It reports your chip, memory, free disk, macOS version, and whether
   Homebrew, Docker, Node, Bun and ffmpeg are installed. Then it lists **which tools
   this Mac can't run locally**, and asks before going on. (Bun and ffmpeg aren't
   needed: VoiceStudio and Cap bring their own.)
2. **Prerequisites.** It installs Homebrew, Node.js and Docker Desktop if they're
   missing, asking first.
3. **`.env`.** It creates your private keys file and generates every password and
   secret. You only paste in the API keys.
4. **The 8 tools, in the order above, one at a time.** After each one it runs a
   health check (the address loads, or the app launches) and writes the result to
   `SETUP_LOG.md` before moving on. If a tool fails, it asks whether to carry on.
5. **The hub.** It starts the hub and opens http://localhost:4000.

Re-run a single tool any time with `./install.sh seo` (ids: `video voice seo notes
dictation calcom chatwoot record`).

**Memory guide:** 16 GB or more runs everything comfortably. Give Docker Desktop
8 GB (Settings, then Resources). On an 8 GB Mac, turn off what you don't need with
`STUDIO_DISABLED=seo` (or similar) in `.env`. Intel Macs can't run VoiceStudio's
voice engine.

---

## Your keys

Everything lives in **one file: `~/studio-os/.env`**. It's gitignored and private to
your user account (chmod 600). `.env.example` lists every key, what it costs, and the
exact page to get it from. The hub's **Status** tab shows which ones are still missing.
It only checks whether each one is filled in, never the value.

| Key | For | Needed? | Cost | Get it |
|-----|-----|---------|------|--------|
| `HIGGSFIELD_API_KEY` | OpenHiggsfield | Required | Pay per generation | platform.higgsfield.ai |
| `OPEN_HIGGSFIELD_READ_WRITE_TOKEN` | OpenHiggsfield uploads (start frames, references) | Optional | Free (Vercel Hobby) | vercel.com, then Storage, then Blob |
| `MUAPI_API_KEY` | Open Generative AI (fallback only) | Required if you use it | Pay per generation | muapi.ai |
| `HF_TOKEN` | VoiceStudio (faster downloads, speaker separation) | Optional | Free | huggingface.co/settings/tokens |
| `DATAFORSEO_API_KEY` | OpenSEO data | **Required** | $50 minimum top-up, then pay as you go | app.dataforseo.com/api-access, then run `./install.sh dataforseo-key` |
| `OPENROUTER_API_KEY` | OpenSEO's AI assistant | Optional | Cents | openrouter.ai/keys |
| `SEO_GOOGLE_CLIENT_ID` / `_SECRET` | Search Console in OpenSEO | Optional | Free | console.cloud.google.com |
| `OPENAI_API_KEY` / `GROQ_API_KEY` | OpenWhispr cloud transcription | Optional | Pay as you go / free tier | platform.openai.com, console.groq.com |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Booking confirmations (Cal.com), replies (Chatwoot) | Recommended | Free (Resend: 3,000 emails a month) | resend.com/api-keys |
| `CALCOM_GOOGLE_API_CREDENTIALS` | Google Calendar sync | Optional | Free | console.cloud.google.com |
| `CLOUDFLARE_TUNNEL_TOKEN` | Public booking links and chat | Optional | Free (you need a domain) | one.dash.cloudflare.com, then Networks, then Tunnels |

Two apps can't read `.env`: **OpenHiggsfield** (and the fallback) asks for its key in
the browser, and **VoiceStudio** and **OpenWhispr** have their own settings screens.
Paste the key there once; `.env` stays your master copy. After editing `.env`, run
`./stop.sh && ./start.sh`.

---

## Every day

| Command | What it does |
|---------|--------------|
| `./start.sh` | Starts the Docker tools, the hub and the four Mac apps, then opens the hub. `--no-apps` leaves the apps closed |
| `./stop.sh` | Stops everything and quits the apps. Your data is kept. `--keep-apps` leaves dictation and recording running |
| `./backup.sh` | Backs up all the data to `backups/<date>/`. `--skip-media` leaves out Cap recordings |
| `./restore.sh backups/<date>` | Puts a backup back (asks first). Add `--apps` to restore the Mac apps' data too |
| `./verify.sh` | Restarts everything from scratch and checks that all 8 tools come up. Logs the result |
| `./preflight.sh` | Re-runs the Phase 0 Mac check |

**What a backup holds:** full database dumps for Cal.com and Chatwoot; OpenSEO's
data; Chatwoot's uploads; your `.env` (so keep backups private); and the data
folders of AppFlowy, OpenWhispr, VoiceStudio and Cap. Model files and caches are
skipped because the apps re-download them. Set `BACKUP_COPY_TO=/Volumes/T7/studio-os-backups`
in `.env` to copy every backup to your external drive automatically.

---

## First run in each tool

- **OpenHiggsfield** (localhost:4101): press **Add key** and paste `id:secret`.
  Without `OPEN_HIGGSFIELD_READ_WRITE_TOKEN`, text-to-image and text-to-video work,
  but uploading reference frames doesn't. Your gallery lives in this browser, so
  download the clips you keep. If the key box won't stick in Safari, use Chrome
  (Safari can refuse secure cookies on `localhost`).
- **VoiceStudio**: the first launch sets up its own Python and FFmpeg, which takes a
  few minutes. It asks before downloading any voice model. Clone a voice only with
  permission (yours is fine!).
- **OpenSEO** (localhost:4102): the first visitor creates the admin account, so do it
  straight away. You need `DATAFORSEO_API_KEY` before any data shows up.
- **AppFlowy**: choose **"Skip / use locally"** at sign-in to keep everything on your Mac.
- **OpenWhispr**: allow the Microphone and Accessibility permissions it asks for
  (System Settings, then Privacy & Security), then pick a local model.
- **Cal.com** (localhost:4103): a setup wizard creates your account. If it insists on
  "Connect your calendar", skip it by going to `localhost:4103/event-types`. Make a
  "Brand deal call" event type.
- **Chatwoot** (localhost:4104): the first screen creates the super-admin account.
  Then go to Settings, then Inboxes, to add email, website chat or Instagram.
- **Cap**: allow Screen Recording, Camera and Microphone. Recordings are stored
  locally. Cap's cloud share links are an optional paid extra.

---

## Letting brands book you

Out of the box, `localhost:4103` only works on your Mac. To give brands a real link:

1. Put a domain on Cloudflare (free plan).
2. Cloudflare dashboard: go to **Networks**, then **Tunnels**, then **Create tunnel**
   (type: Cloudflared). Copy the token into `CLOUDFLARE_TUNNEL_TOKEN`.
3. Add public hostnames in the tunnel: `book.yourdomain.com` points to
   `http://calcom:3000`, and `inbox.yourdomain.com` points to `http://chatwoot-rails:3000`.
4. In `.env`, set `CALCOM_PUBLIC_URL=https://book.yourdomain.com` and
   `CHATWOOT_PUBLIC_URL=https://inbox.yourdomain.com`, and change
   `COMPOSE_PROFILES=open-higgsfield,public`.
5. Run `./stop.sh && ./start.sh`. Turn on System Settings, then Battery/Energy, then
   "Prevent automatic sleeping", or your links go down when the Mac sleeps.

Only Cal.com and Chatwoot are exposed. Everything else stays private.

---

## Updating

**Always run `./backup.sh` first.** Database updates can't be undone without a backup.

| Tool | How to update |
|------|---------------|
| Video tool | `./install.sh video` (pulls the latest code and rebuilds) |
| VoiceStudio, AppFlowy, OpenWhispr, Cap | `brew upgrade --cask voicestudio appflowy openwhispr cap` (or use each app's own "Check for updates") |
| OpenSEO | `docker compose pull seo-runtime seo-init seo-crawl-gateway seo-web && ./stop.sh && ./start.sh`. Database migrations run on start |
| Cal.com | Find a newer tag at hub.docker.com/r/calcom/cal.com/tags (on Apple Silicon use the `-arm` one), set `CALCOM_IMAGE_TAG` in `.env`, then `docker compose pull calcom && ./stop.sh && ./start.sh` |
| Chatwoot | Set `CHATWOOT_IMAGE_TAG` to the new version with `-ce` (e.g. `v4.20.0-ce`), then `docker compose pull chatwoot-rails chatwoot-sidekiq && ./stop.sh && ./start.sh`. Migrations run on start |
| Everything else Homebrew installed | `brew update && brew upgrade` |

Afterwards, run `./verify.sh` to confirm everything came back.

---

## Troubleshooting

- **A card says Down.** Open the Status tab: the Detail column says why. Then
  `cd ~/studio-os && docker compose logs --tail 50 <service>` (services: `calcom`,
  `chatwoot-rails`, `seo-runtime`, `seo-init`, `open-higgsfield`).
- **"VoiceStudio is damaged and can't be opened."** That's macOS blocking an unsigned
  download, not a broken file. Run
  `xattr -dr com.apple.quarantine /Applications/VoiceStudio.app`.
  `install.sh` offers to do this for you.
- **Cal.com takes ages to start the first time.** That's normal: it sets up its
  database. Give it 5 minutes.
- **Mac feels slow.** Lower Docker's memory, or turn off tools you aren't using with
  `STUDIO_DISABLED` in `.env`.
- **Hub page says the server isn't answering.** Run `./start.sh`. Its log is
  `logs/hub.log`.
- **Start over completely (deletes all data!):** `./backup.sh`, then
  `docker compose --profile '*' down -v`, then `./install.sh`.

---

## What's in this folder

```
studio-os/
├── docker-compose.yml   the 4 server tools, fixed ports, named volumes
├── .env.example         every key and setting, with costs and links
├── .env                 YOUR keys (created by install.sh, never committed)
├── preflight.sh         Phase 0: check the Mac
├── install.sh           install the tools one at a time, with health checks
├── start.sh / stop.sh   start or stop everything
├── backup.sh / restore.sh
├── verify.sh            restart from scratch and check all 8 tools
├── SETUP_LOG.md         every install, check and verification, logged
├── hub/                 the localhost:4000 page (tools.json lists every tool and key)
├── build/               Dockerfile for OpenHiggsfield (the project ships none)
├── lib/common.sh        shared script helpers
└── src/ backups/ logs/  created on your Mac, never committed
```
