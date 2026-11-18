// Editing operations used by the UI. Each takes a timeline and returns a NEW one; the app
// then diffs old → new into ops and sends those to the server. All work on the active sequence.
import {
  activeSeq, acceptsMedia, clipEnd, clipLength, isText, r6,
  type Timeline, type Clip, type MediaClip, type TextClip, type Track, type TrackKind, type Sequence, type TextStyle,
} from "../shared/model";

export { clipEnd, clipLength, isText, r6, activeSeq };
export const MIN_LEN = 0.1;

const clone = (tl: Timeline) => structuredClone(tl);
const seqOf = (tl: Timeline) => activeSeq(tl);
const newClipId = (tl: Timeline) => `c${tl.nextId++}`;

export function findClip(tl: Timeline, clipId: string) {
  for (const seq of tl.sequences) for (const track of seq.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track, seq };
  }
  return null;
}
export const mediaById = (tl: Timeline, id: string) => tl.media.find((m) => m.id === id);
export { acceptsMedia };

export function addMediaClip(tl: Timeline, mediaId: string, trackId: string, start: number) {
  const out = clone(tl);
  const m = mediaById(out, mediaId);
  const track = seqOf(out).tracks.find((t) => t.id === trackId);
  if (!m || !track || track.locked || !acceptsMedia(track.kind, m.type)) return { timeline: tl, clipId: null as string | null };
  const len = m.type === "image" ? 3 : m.duration || 3;
  const clip: MediaClip = { id: newClipId(out), media: m.id, start: r6(Math.max(0, start)), in: 0, out: r6(len), volume: 1, fadeIn: 0, fadeOut: 0 };
  if (track.kind === "video") clip.fit = "cover";
  track.clips.push(clip);
  return { timeline: out, clipId: clip.id };
}

export function addTextClip(tl: Timeline, start: number, text = "Text", style: Partial<TextStyle> = {}) {
  const out = clone(tl);
  const seq = seqOf(out);
  let track = seq.tracks.find((t) => t.kind === "text" && !t.locked);
  if (!track) {
    track = { id: uniqueTrackId(seq, "text"), kind: "text", name: "Text", muted: false, hidden: false, locked: false, clips: [] };
    seq.tracks.push(track);
  }
  const clip: TextClip = {
    id: newClipId(out), start: r6(Math.max(0, start)), duration: 3, text,
    style: { font: "default", size: 96, color: "#FFFFFF", x: 0.5, y: 0.5, align: "center", bold: true, shadow: false, ...style },
    fadeIn: 0, fadeOut: 0,
  };
  track.clips.push(clip);
  return { timeline: out, clipId: clip.id };
}

export function uniqueTrackId(seq: Sequence, kind: TrackKind) {
  const p = kind[0];
  let n = 1;
  while (seq.tracks.some((t) => t.id === `${p}${n}`)) n++;
  return `${p}${n}`;
}

export function addTrack(tl: Timeline, kind: TrackKind) {
  const out = clone(tl);
  const seq = seqOf(out);
  const id = uniqueTrackId(seq, kind);
  const label = { video: "Video", audio: "Audio", text: "Text" }[kind];
  seq.tracks.push({ id, kind, name: `${label} ${id.slice(1)}`, muted: false, hidden: false, locked: false, clips: [] });
  return out;
}

export function removeTrack(tl: Timeline, trackId: string) {
  const out = clone(tl);
  const seq = seqOf(out);
  seq.tracks = seq.tracks.filter((t) => t.id !== trackId);
  return out;
}

export function updateClip(tl: Timeline, clipId: string, patch: Record<string, unknown>) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f || f.track.locked) return tl;
  const { style, ...rest } = patch as { style?: Partial<TextStyle> };
  Object.assign(f.clip, rest);
  if (style && isText(f.clip)) f.clip.style = { ...f.clip.style, ...style };
  return out;
}

export function updateTrack(tl: Timeline, trackId: string, patch: Partial<Track>) {
  const out = clone(tl);
  const t = seqOf(out).tracks.find((x) => x.id === trackId);
  if (t) Object.assign(t, patch);
  return out;
}

export function deleteClip(tl: Timeline, clipId: string) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f || f.track.locked) return tl;
  f.track.clips = f.track.clips.filter((c) => c.id !== clipId);
  return out;
}

export function moveClip(tl: Timeline, clipId: string, start: number, trackId?: string) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f || f.track.locked) return tl;
  f.clip.start = r6(Math.max(0, start));
  if (trackId && trackId !== f.track.id) {
    const dest = f.seq.tracks.find((t) => t.id === trackId);
    const m = !isText(f.clip) ? mediaById(out, f.clip.media) : undefined;
    const ok = dest && !dest.locked && (isText(f.clip) ? dest.kind === "text" : acceptsMedia(dest.kind, m?.type));
    if (ok) {
      f.track.clips = f.track.clips.filter((c) => c.id !== clipId);
      dest!.clips.push(f.clip);
      if (dest!.kind === "video" && !isText(f.clip) && !f.clip.fit) f.clip.fit = "cover";
      if (dest!.kind === "audio" && !isText(f.clip)) delete f.clip.fit;
    }
  }
  return out;
}

/** Move an edge. "start": left edge to `time` (start and in move together). "end": right edge. */
export function trimClip(tl: Timeline, clipId: string, edge: "start" | "end", time: number) {
  const out = clone(tl);
  const f = findClip(out, clipId);
  if (!f || f.track.locked) return tl;
  const c = f.clip;
  const end = clipEnd(c);
  if (isText(c)) {
    if (edge === "start") { const s = Math.min(Math.max(0, time), end - MIN_LEN); c.duration = r6(end - s); c.start = r6(s); }
    else c.duration = r6(Math.max(MIN_LEN, time - c.start));
    return out;
  }
  const m = mediaById(out, c.media);
  const maxOut = m && m.duration != null ? m.duration : Infinity;
  if (edge === "start") {
    const s = Math.min(Math.max(time, c.start - c.in, 0), end - MIN_LEN);
    c.in = r6(c.in + (s - c.start));
    c.start = r6(s);
  } else {
    c.out = r6(Math.min(c.in + Math.max(MIN_LEN, time - c.start), maxOut));
  }
  return out;
}

export function splitClip(tl: Timeline, clipId: string, t: number) {
  const f = findClip(tl, clipId);
  if (!f || f.track.locked || t <= f.clip.start + MIN_LEN / 2 || t >= clipEnd(f.clip) - MIN_LEN / 2) return { timeline: tl, newId: null as string | null };
  const out = clone(tl);
  const g = findClip(out, clipId)!;
  const left = g.clip;
  const right = structuredClone(left) as Clip;
  right.id = newClipId(out);
  const offset = r6(t - left.start);
  if (isText(left)) { (right as TextClip).duration = r6(left.duration - offset); left.duration = offset; }
  else { left.out = r6(left.in + offset); (right as MediaClip).in = left.out; }
  right.start = r6(t);
  right.fadeIn = 0;
  left.fadeOut = 0;
  g.track.clips.push(right);
  return { timeline: out, newId: right.id };
}

/** Clips under time t in the active sequence, top layer first. */
export function clipsAt(tl: Timeline, t: number) {
  const hits: { clip: Clip; track: Track; ti: number }[] = [];
  seqOf(tl).tracks.forEach((track, ti) => {
    for (const c of track.clips) if (t >= c.start && t < clipEnd(c)) hits.push({ clip: c, track, ti });
  });
  return hits.sort((a, b) => b.ti - a.ti);
}

export function snapPoints(tl: Timeline, excludeId: string | null, playhead: number) {
  const pts = [0, playhead];
  for (const t of seqOf(tl).tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
  return pts;
}

export function snap(value: number, points: number[], threshold: number) {
  let best = value, bestD = threshold;
  for (const p of points) { const d = Math.abs(p - value); if (d < bestD) { best = p; bestD = d; } }
  return best;
}

export function setActiveSequence(tl: Timeline, id: string) {
  const out = clone(tl);
  out.activeSequence = id;
  return out;
}

/** Copy the active sequence (new ids for everything) and switch to the copy. */
export function duplicateSequence(tl: Timeline, name?: string) {
  const out = clone(tl);
  const src = seqOf(out);
  let n = 1;
  while (out.sequences.some((s) => s.id === `s${n}`)) n++;
  const copy: Sequence = structuredClone(src);
  copy.id = `s${n}`;
  copy.name = name || `${src.name} copy`;
  for (const t of copy.tracks) for (const c of t.clips) c.id = newClipId(out);
  out.sequences.push(copy);
  out.activeSequence = copy.id;
  return out;
}
