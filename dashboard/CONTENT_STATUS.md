# Feeding Omnia OS's Studio board

Omnia OS (https://claude.ai/artifact/PJMgHgWkjLs5XJQBZZTTgV) keeps its Studio
board in the artifact's own database, not in Notion. (The earlier dashboard at
https://claude.ai/artifact/2nYPtipRhUARqzfpsiwdze is superseded.) Any
Claude Code session signed in as Omnia can write to it with the
`ArtifactData` tool (load it with ToolSearch `select:ArtifactData`). The page
re-reads these documents on every open, on "Sync now", and live while it is
open.

Write one document in collection `os` with action `set`. Read each one
first (`get`) and pass its `version` as `if_version`, so an edit Omnia made on
the page is not overwritten.

## `os/studio`

```json
{
  "updatedAt": 1758700000000,
  "source": "editing session",
  "cards": [
    {
      "id": "p-day18",
      "brand": "@blkgrlco",
      "title": "Day 18 of 90 vlog",
      "stage": "Edited",
      "due": "2026-09-24",
      "platform": "TikTok · Reels · Shorts",
      "footage": "T7 SSD",
      "script": "https://docs.google.com/…",
      "note": "All 9 sections built, no master yet. Left: cards, bleep, level, punch-ins, music, copy.",
      "created": 1758700000000
    }
  ]
}
```

- `brand`: `@blkgrlco`, `@blkgrlcotoo` or `@uglyinbetween` (shown as "Podcast").
- `stage`: `Idea`, `Scripted`, `Shot list` (needs shooting), `Filmed` (shot, no
  edit started), `Edited` (cut in progress or master delivered), `Scheduled`
  (queued in Metricool), `Posted`.
- `footage`: `missing`, `Drive`, `T7 SSD` or `have`. `missing` puts the card on
  the Saturday shot list flag.
- One item per piece of content that is not yet live. Drop items once they
  are published; Metricool supplies the Posted count.
- Keep `id` stable from day to day so shot-list ticks survive.
- `due` is the planned upload date (`YYYY-MM-DD`) or `""`.
- `updatedAt` (epoch ms) and `source` drive the "Stages updated … by …" line;
  the page warns when `updatedAt` is older than 36 hours.

Cards Omnia edits on the page carry the same ids, so read the current
document and merge rather than replacing wholesale.

## If the write is refused

Commit the same JSON to this repo as `dashboard/content-status.json` on the
dashboard branch and say so; it can be loaded from there.
