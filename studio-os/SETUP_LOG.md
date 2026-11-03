# Studio OS setup log

Every install, health check and verification run is appended here, newest at the bottom.


## Session 0: kit built and repos vetted (cloud, before touching the Mac) · 2026-11-03

Built in a cloud session, **not on the Mac**. That session had no access to the Mac,
so nothing below was installed or health-checked there yet. Phase 0 and the
installs happen when `./install.sh` runs on the Mac.

### Repo check (rule: stop if archived, a fork, or no activity for 6+ months)

| # | Repo | Archived | Fork | Last commit | Verdict |
|---|------|----------|------|-------------|---------|
| 1 | wide-trace/open-higgsfield | No | No | 2026-09-17 | ⚠️ Active, but **no LICENSE file** (all rights reserved), no Dockerfile, and it's a front end for Higgsfield's paid API. install.sh asks before using it |
| 1b | Anil-matcha/Open-Generative-AI (fallback) | No | No | 2026-11-01 | ✅ MIT, has a Dockerfile. Uses the MuAPI paid API |
| 2 | debpalash/OmniVoice-Studio | No | No | 2026-11-02 | ✅ Renamed **debpalash/VoiceStudio** (AGPL-3.0). Apple Silicon only for the local engine |
| 3 | every-app/open-seo | No | No | 2026-10-30 (v0.1.22) | ✅ MIT. Official "standalone" Docker setup used |
| 4 | AppFlowy-IO/AppFlowy | No | No | 2026-10-28 | ✅ |
| 5 | OpenWhispr/openwhispr | No | No | 2026-11-02 | ✅ MIT. Homebrew cask `openwhispr` |
| 6 | calcom/cal.com | No | No | 2026-11-02 | ⚠️ Now redirects to **calcom/cal.diy**: a community edition without enterprise features, "for personal, non-production use". Newest prebuilt image is `calcom/cal.com:v6.2.0(-arm)` from **2026-03-02** (8 months old); `calcom/cal.diy` on Docker Hub has no images |
| 7 | chatwoot/chatwoot | No | No | 2026-11-02 (v4.19.1) | ✅ Multi-arch image `v4.19.1-ce` |
| 8 | CapSoftware/Cap | No | No | 2026-11-02 | ✅ Homebrew cask `cap` |

### What was tested in the cloud

- ✅ `docker compose config` is valid for both video options and with the `public` tunnel profile.
- ✅ Hub server and page: every tab renders on desktop and phone widths, with no console
  errors and no sideways scrolling. Arrow keys move between tabs. The status API works.
  Other websites can't trigger app launches, and `.env` can't be fetched through the hub.
- ✅ `.env` helpers (values with spaces, `<>`, JSON) and `start.sh --hub-only` / `stop.sh`.
- ✅ `preflight.sh` runs and writes its report (on Linux, so the Mac-only parts were skipped).
- ❌ **Not tested:** pulling or building images (Docker Hub and ghcr.io were blocked from
  the cloud session), the OpenHiggsfield Dockerfile build, the Homebrew installs, the
  macOS app checks, `backup.sh` / `restore.sh` against real volumes, and `verify.sh`.
  These run for the first time on the Mac.
