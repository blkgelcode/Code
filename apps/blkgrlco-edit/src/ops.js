// Editing operations on a timeline object. Each returns a NEW timeline (never mutates).
// Shared by the UI and the tests.
import { clipDuration, clipEnd, nextClipId, r3, DEFAULT_TEXT_STYLE } from "../server/timeline.js";

export { clipDuration, clipEnd, r3 };
export const MIN_LEN = 0.1; // shortest clip, seconds

const clone = (tl) => structuredClone(tl);

export function findClip(tl, clipId) {
  for (const t of tl.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) return { clip: c, track: t };
  }
  return null;
}

export const mediaById = (tl, id) => tl.media.find((m) => m.id === id);

/** Which track kinds a media type can go on. */
export function acceptsMedia(trackKind, mediaType) {
  if (trackKind === "video") return mediaType === "video" || mediaType === "image";
  if (trackKind === "audio") return mediaType === "audio" || mediaType === "video";
  return false;
}

export function addMediaClip(tl, { mediaId, trackId, start }) {
  const out = clone(tl);
  const m = mediaById(out, mediaId);
  const track = out.tracks.find((t) => t.id === trackId);
  if (!m || !track || !acceptsMedia(track.kind, m.type)) return { timeline: tl, clipId: null };
  const len = m.type === "image" ? 3 : m.duration || 3;
  const clip = { id: nextClipId(out), media: m.id, start: r3(Math.max(0, start)), in: 0, out: r3(len) };
  if (m.type !== "image") clip.volume = 1;
  if (track.kind === "video") clip.fit = "cover";
  track.clips.push(clip);
  return { timeline: out, clipId: clip.id };
}

export function addTextClip(tl, { trackId, start, text = "Text", duration = 3, style = {} }) {
  const out = clone(tl);
  let track = out.tracks.find((t) => t.id === trackId && t.kind === "text") || out.tracks.find((t) => t.kind === "text");
  if (!track) {
    track = { id: uniqueTrackId(out, "text"), kind: "text", name: "Text", muted: false, hidden: false, clips: [] };
    out.tracks.push(track);
  }
  const clip = { id: nextClipId(out), start: r3(Math.max(0, start)), duration, text, style: { ...DEFAULT_TEXT_STYLE, ...style }, fadeIn: 0, fadeOut: 0 };
  track.clips.push(clip);
  return { timeline: out, clipId: clip.id };
}

export function uniqueTrackId(tl, kind) {
  const p = kind[0];
  let n = 1;
  while (tl.tracks.some((t) => t.id === `${p}${n}`)) n++;
  return `${p}${n}`;
}

export function addTrack(tl, kind) {
  const out = clone(tl);
  const id = uniqueTrackId(out, kind);
  const label = { video: "Video", audio: "Audio", text: "Text" }[kind];
  out.tracks.push({ id, kind, name: `${label} ${id.slice(1)}`, muted: false, hidden: false, clips: [] });
  return out;
}

export function removeTrack(tl, trackId) {
  const out = clone(tl);
  out.tracks = out.tracks.filter((t) => t.id !== trackId);
  return out;
}

export function updateClip(tl, clipId, patch) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f) return tl;
  Object.assign(f.clip, patch);
  if (patch.style) f.clip.style = { ...findClip(tl, clipId).clip.style, ...patch.style };
  return out;
}

export function updateTrack(tl, trackId, patch) {
  const out = clone(tl);
  const t = out.tracks.find((x) => x.id === trackId);
  if (t) Object.assign(t, patch);
  return out;
}

export function deleteClip(tl, clipId) {
  const out = clone(tl);
  for (const t of out.tracks) t.clips = t.clips.filter((c) => c.id !== clipId);
  return out;
}

/** Move a clip to a new start (and optionally another track of a compatible kind). */
export function moveClip(tl, clipId, { start, trackId }) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f) return tl;
  f.clip.start = r3(Math.max(0, start));
  if (trackId && trackId !== f.track.id) {
    const dest = out.tracks.find((t) => t.id === trackId);
    const m = f.clip.media ? mediaById(out, f.clip.media) : null;
    const ok = dest && (f.clip.text !== undefined ? dest.kind === "text" : acceptsMedia(dest.kind, m?.type));
    if (ok) {
      f.track.clips = f.track.clips.filter((c) => c.id !== clipId);
      dest.clips.push(f.clip);
      if (dest.kind === "video" && !f.clip.fit) f.clip.fit = "cover";
    }
  }
  return out;
}

/**
 * Trim an edge. edge "start": the left edge moves to `time` (start and in move together,
 * the clip's right edge stays put). edge "end": the right edge moves to `time`.
 */
export function trimClip(tl, clipId, edge, time) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f) return tl;
  const c = f.clip;
  const m = c.media ? mediaById(out, c.media) : null;
  const maxOut = m && m.type !== "image" ? m.duration ?? Infinity : Infinity;
  const end = clipEnd(c);
  if (c.text !== undefined) {
    if (edge === "start") {
      const s = Math.min(Math.max(0, time), end - MIN_LEN);
      c.duration = r3(end - s);
      c.start = r3(s);
    } else c.duration = r3(Math.max(MIN_LEN, time - c.start));
    return out;
  }
  if (edge === "start") {
    // can't pull the left edge earlier than the media's first frame
    const earliest = c.start - c.in;
    const s = Math.min(Math.max(time, earliest, 0), end - MIN_LEN);
    c.in = r3(c.in + (s - c.start));
    c.start = r3(s);
  } else {
    const len = Math.max(MIN_LEN, time - c.start);
    c.out = r3(Math.min(c.in + len, maxOut));
  }
  return out;
}

/** Split a clip at timeline time t. Returns { timeline, newId } (newId is the right half). */
export function splitClip(tl, clipId, t) {
  const f = findClip(tl, clipId);
  if (!f) return { timeline: tl, newId: null };
  const c = f.clip;
  if (t <= c.start + MIN_LEN / 2 || t >= clipEnd(c) - MIN_LEN / 2) return { timeline: tl, newId: null };
  const out = clone(tl);
  const g = findClip(out, clipId);
  const left = g.clip;
  const right = structuredClone(left);
  right.id = nextClipId(out);
  const offset = r3(t - left.start);
  if (left.text !== undefined) {
    right.duration = r3(left.duration - offset);
    left.duration = offset;
  } else {
    left.out = r3(left.in + offset);
    right.in = left.out;
  }
  right.start = r3(t);
  // a split creates a hard cut: the fade-out belongs to the right half, the fade-in to the left
  right.fadeIn = 0;
  left.fadeOut = 0;
  g.track.clips.push(right);
  return { timeline: out, newId: right.id };
}

/** Clips under time t, top layer first. */
export function clipsAt(tl, t, kinds = ["video", "audio", "text"]) {
  const hits = [];
  tl.tracks.forEach((track, ti) => {
    if (!kinds.includes(track.kind)) return;
    for (const c of track.clips) if (t >= c.start && t < clipEnd(c)) hits.push({ clip: c, track, ti });
  });
  return hits.sort((a, b) => b.ti - a.ti);
}

/** Edges to snap to: 0, every clip edge (except the one being dragged), and the playhead. */
export function snapPoints(tl, excludeId, playhead) {
  const pts = [0, playhead];
  for (const t of tl.tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
  return pts;
}

export function snap(value, points, threshold) {
  let best = value;
  let bestD = threshold;
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
