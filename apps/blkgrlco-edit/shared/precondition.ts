// Can this op still be applied to this timeline? Each op records what it expects to find
// (set: the old value; remove: the exact thing being removed; …). If that's no longer true,
// someone changed the same thing in between, and we refuse instead of silently overwriting.
import type { Timeline } from "./model";
import { clipEnd } from "./model";
import type { Op, Target } from "./ops";

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function findClip(tl: Timeline, id: string) {
  for (const s of tl.sequences) for (const t of s.tracks) {
    const c = t.clips.find((x) => x.id === id);
    if (c) return { c, s, t };
  }
  return null;
}

function resolve(tl: Timeline, t: Target): any {
  switch (t.kind) {
    case "timeline": return tl;
    case "project": return tl.project;
    case "media": return tl.media.find((m) => m.id === t.id);
    case "sequence": return tl.sequences.find((s) => s.id === t.id);
    case "track": return tl.sequences.find((s) => s.id === t.seq)?.tracks.find((x) => x.id === t.id);
    case "clip": return findClip(tl, t.id)?.c;
  }
}

const name = (t: Target) => (t.kind === "track" ? `track ${t.id}` : t.kind === "clip" ? t.id : t.kind === "media" ? `media ${t.id}` : t.kind === "sequence" ? `sequence ${t.id}` : t.kind);
const get = (o: any, key: string) => key.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const fmt = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v));

/** null if the op applies cleanly; otherwise a short reason. */
export function precondition(tl: Timeline, op: Op): string | null {
  switch (op.t) {
    case "set": {
      const obj = resolve(tl, op.target);
      if (!obj) return `${name(op.target)} no longer exists`;
      const cur = get(obj, op.key);
      if (!eq(cur, op.prev)) return `${name(op.target)}.${op.key} is now ${fmt(cur)} (expected ${fmt(op.prev)})`;
      return null;
    }
    case "addMedia": return tl.media.some((m) => m.id === op.value.id) ? `media ${op.value.id} already exists` : null;
    case "removeMedia": {
      const m = tl.media.find((x) => x.id === op.value.id);
      if (!m) return null; // already gone
      for (const s of tl.sequences) for (const t of s.tracks) for (const c of t.clips) if ((c as any).media === m.id) return `${c.id} still uses ${m.id}`;
      return null;
    }
    case "addSequence": return tl.sequences.some((s) => s.id === op.value.id) ? `sequence ${op.value.id} already exists` : null;
    case "removeSequence": {
      const s = tl.sequences.find((x) => x.id === op.value.id);
      if (!s) return `sequence ${op.value.id} no longer exists`;
      return s.tracks.length ? `sequence ${s.id} has tracks added since` : null;
    }
    case "addTrack": {
      const s = tl.sequences.find((x) => x.id === op.seq);
      if (!s) return `sequence ${op.seq} no longer exists`;
      return s.tracks.some((t) => t.id === op.value.id) ? `track ${op.value.id} already exists` : null;
    }
    case "removeTrack": {
      const t = tl.sequences.find((x) => x.id === op.seq)?.tracks.find((x) => x.id === op.value.id);
      if (!t) return `track ${op.value.id} no longer exists`;
      return t.clips.length ? `track ${t.id} has clips on it now (${t.clips.map((c) => c.id).join(", ")})` : null;
    }
    case "addClip": {
      if (findClip(tl, op.value.id)) return `clip ${op.value.id} already exists`;
      const t = tl.sequences.find((x) => x.id === op.seq)?.tracks.find((x) => x.id === op.track);
      return t ? null : `track ${op.track} no longer exists`;
    }
    case "removeClip": {
      const f = findClip(tl, op.value.id);
      if (!f) return `${op.value.id} was already deleted`;
      if (!eq(f.c, op.value)) return `${op.value.id} was changed since (now ${fmt(f.c.start)}–${fmt(clipEnd(f.c))})`;
      return null;
    }
    case "moveClip": {
      const f = findClip(tl, op.id);
      if (!f) return `${op.id} no longer exists`;
      if (f.s.id !== op.from.seq || f.t.id !== op.from.track) return `${op.id} is now on ${f.t.id}`;
      const dest = tl.sequences.find((x) => x.id === op.to.seq)?.tracks.find((x) => x.id === op.to.track);
      return dest ? null : `track ${op.to.track} no longer exists`;
    }
    case "reorderTracks": {
      const s = tl.sequences.find((x) => x.id === op.seq);
      if (!s) return `sequence ${op.seq} no longer exists`;
      return eq(s.tracks.map((t) => t.id), op.prev) ? null : "the track order changed since";
    }
  }
}
