# Feeding the dashboard's Studio pipeline

The dashboard (https://claude.ai/artifact/2nYPtipRhUARqzfpsiwdze) keeps its
pipeline and shot list in the artifact's own database, not in Notion. Any
Claude Code session signed in as Omnia can write to it with the
`ArtifactData` tool (load it with ToolSearch `select:ArtifactData`). The page
re-reads these documents on every open, on "Sync now", and live while it is
open.

Write two documents in collection `dash` with action `set`. Read each one
first (`get`) and pass its `version` as `if_version`, so an edit Omnia made on
the page is not overwritten.

## `dash/pipeline`

```json
{
  "updatedAt": 1758700000000,
  "source": "editing session",
  "items": [
    {
      "id": "p-day18",
      "brand": "@blkgrlco",
      "title": "Day 18 of 90 vlog",
      "stage": "Edited",
      "date": "2026-09-24",
      "note": "All 9 sections built, no master yet. Left: cards, bleep, level, punch-ins, music, copy.",
      "created": 1758700000000
    }
  ]
}
```

- `brand`: `@blkgrlco`, `@blkgrlcotoo` or `@uglyinbetween` (shown as "Podcast").
- `stage`: `Idea`, `Scripted` (planned/written), `Filmed` (shot, no edit
  started), `Edited` (cut in progress, or master delivered but not scheduled),
  `Posted`.
- One item per piece of content that is not yet live. Drop items once they
  are published; Metricool supplies the Posted count.
- Keep `id` stable from day to day so shot-list ticks survive.
- `date` is the planned upload date (`YYYY-MM-DD`) or `""`.
- `updatedAt` (epoch ms) and `source` drive the "Stages updated … by …" line;
  the page warns when `updatedAt` is older than 36 hours.

## `dash/shots`

```json
{
  "done":  { "p-houston": true },
  "notes": { "p-houston": "All footage is on the T7; it needs an edit, not more filming." }
}
```

Only `Filmed` items appear on the Saturday shot list. `done: true` means the
footage is complete.

## If the write is refused

Commit the same JSON to this repo as `dashboard/content-status.json` on the
dashboard branch and say so; it can be loaded from there.
