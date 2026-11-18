// Pro editing operations (Phase 4). Pure functions: each takes a timeline and returns a NEW one
// (or the same object when nothing could be done, with a reason). Used by the app's tools and
// keys and by `bge`, so Claude and Omnia get exactly the same edits.
//
// Vocabulary (Premiere/FCP):
//   targeted tracks   where Insert/Overwrite put the source's picture and sound
//   sync lock         ripple edits (insert, extract, ripple delete, ripple trim) also shift these
//                     tracks, so everything after the edit stays in sync
//   link              clips sharing a `link` id (a shot's picture + its sound) select, move and
//                     trim together; Alt-drag (or `linked: false`) edits one side (J/L cuts)
import {
  clipEnd, clipLength, isNested, isText, isMediaClip, r6, sequenceDuration, toGrid, acceptsMedia,
  type Timeline, type Sequence, type Track, type Clip, type MediaClip, type TextClip, type NestedClip, type Marker,
} from "./model";
import { toTimecode } from "./timecode";

export const EPS = 1e-6;
export type Result = { timeline: Timeline; ok: boolean; message?: string; ids?: string[] };
const done = (timeline: Timeline, ids?: string[], message?: string): Result => ({ timeline, ok: true, ids, message });
const fail = (timeline: Timeline, message: string): Result => ({ timeline, ok: false, message });

// ------------------------------------------------------------------ helpers
export const seqOf = (tl: Timeline, id = tl.activeSequence) => {
  const s = tl.sequences.find((x) => x.id === id);
  if (!s) throw new Error(`sequence ${id} doesn't exist`);
  return s;
};
const newId = (tl: Timeline, p = "c") => `${p}${tl.nextId++}`;
const grid = (seq: Sequence, t: number) => toGrid(t, seq.fps);

export function locate(seq: Sequence, clipId: string) {
  for (const track of seq.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}
const mediaDur = (tl: Timeline, c: Clip): number => {
  if (isNested(c)) { const s = tl.sequences.find((x) => x.id === c.seq); return s ? sequenceDuration(s) : Infinity; }
  if (!isMediaClip(c)) return Infinity;
  const m = tl.media.find((x) => x.id === c.media);
  return m && m.type !== "image" && m.duration != null ? m.duration : Infinity;
};

/** The clip plus every clip linked to it (same sequence). */
export function linkedIds(seq: Sequence, clipId: string): string[] {
  const f = locate(seq, clipId);
  if (!f) return [];
  const link = !isText(f.clip) ? (f.clip as MediaClip).link : undefined;
  if (!link) return [clipId];
  const out: string[] = [];
  for (const t of seq.tracks) for (const c of t.clips) if (!isText(c) && (c as MediaClip).link === link) out.push(c.id);
  return out;
}
export const withLinked = (seq: Sequence, ids: string[], linked = true) =>
  [...new Set(linked ? ids.flatMap((id) => linkedIds(seq, id)) : ids)];

/** Linked clips whose source is out of step with their partner: clipId → offset in frames. */
export function syncOffsets(seq: Sequence): Record<string, number> {
  const groups = new Map<string, Clip[]>();
  for (const t of seq.tracks) for (const c of t.clips) {
    const l = !isText(c) ? (c as MediaClip).link : undefined;
    if (l) { if (!groups.has(l)) groups.set(l, []); groups.get(l)!.push(c); }
  }
  const out: Record<string, number> = {};
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    // the picture is the reference when there is one
    const ref = g.find((c) => locateKind(seq, c.id) === "video") || g[0];
    const anchor = ref.start - (ref as MediaClip).in;
    for (const c of g) {
      if (c === ref) continue;
      const off = Math.round(((c.start - (c as MediaClip).in) - anchor) * seq.fps);
      if (off !== 0) out[c.id] = off;
    }
  }
  return out;
}
const locateKind = (seq: Sequence, id: string) => seq.tracks.find((t) => t.clips.some((c) => c.id === id))?.kind;

/** Sorted, unique edit points (clip starts/ends) on visible tracks — for ↑/↓. */
export function editPoints(seq: Sequence, tracks?: string[]): number[] {
  const pts = new Set<number>([0]);
  for (const t of seq.tracks) {
    if (tracks && !tracks.includes(t.id)) continue;
    for (const c of t.clips) { pts.add(r6(c.start)); pts.add(r6(clipEnd(c))); }
  }
  return [...pts].sort((a, b) => a - b);
}
export function nextEditPoint(seq: Sequence, t: number, dir: 1 | -1, tracks?: string[]) {
  const pts = editPoints(seq, tracks);
  if (dir > 0) return pts.find((p) => p > t + EPS) ?? t;
  return [...pts].reverse().find((p) => p < t - EPS) ?? 0;
}

const cloneClip = <C extends Clip>(c: C): C => structuredClone(c);
/** A link id not used anywhere yet, named after a clip ("c12" → "L12"). Doesn't use up clip numbers. */
function freshLink(tl: Timeline, clipId: string) {
  const used = new Set<string>();
  for (const s of tl.sequences) for (const t of s.tracks) for (const c of t.clips) { const l = (c as MediaClip).link; if (l) used.add(l); }
  let l = `L${clipId.replace(/^c/, "")}`;
  for (let i = 2; used.has(l); i++) l = `L${clipId.replace(/^c/, "")}-${i}`;
  return l;
}

/** Remove [a, b) from one track: clips inside go, clips across an edge are trimmed, a clip spanning it is split. */
function cutTrack(tl: Timeline, track: Track, a: number, b: number) {
  const next: Clip[] = [];
  for (const c of track.clips) {
    const s = c.start, e = clipEnd(c);
    if (e <= a + EPS || s >= b - EPS) { next.push(c); continue; }
    if (s >= a - EPS && e <= b + EPS) continue; // entirely inside
    if (s < a && e > b) { // spans: left part keeps the id, right part is new
      const right = cloneClip(c);
      right.id = newId(tl);
      setLen(c, a - s);
      trimHead(right, b - s);
      right.start = r6(b);
      c.fadeOut = 0; right.fadeIn = 0;
      next.push(c, right);
      continue;
    }
    if (s < a) { setLen(c, a - s); c.fadeOut = Math.min(c.fadeOut, a - s); next.push(c); continue; }
    // starts inside, ends after b
    trimHead(c, b - s);
    c.start = r6(b);
    next.push(c);
  }
  track.clips = next;
}
function setLen(c: Clip, len: number) {
  if (isText(c)) c.duration = r6(len);
  else (c as MediaClip).out = r6((c as MediaClip).in + len);
}
function trimHead(c: Clip, by: number) {
  if (isText(c)) c.duration = r6(c.duration - by);
  else (c as MediaClip).in = r6((c as MediaClip).in + by);
}

/** Shift clips at/after t by delta on the given tracks (and markers after t). */
function shiftAfter(seq: Sequence, tracks: Track[], t: number, delta: number, moveMarkers = true) {
  for (const track of tracks) for (const c of track.clips) if (c.start >= t - EPS) c.start = r6(Math.max(0, c.start + delta));
  if (moveMarkers) for (const k of seq.markers) if (k.t >= t - EPS) k.t = r6(Math.max(0, k.t + delta));
  if (seq.marks?.out !== undefined && seq.marks.out >= t - EPS) seq.marks.out = r6(Math.max(0, seq.marks.out + delta));
}
/** Split anything spanning t on these tracks (so an inserted gap opens cleanly). */
function splitAt(tl: Timeline, tracks: Track[], t: number) {
  for (const track of tracks) for (const c of [...track.clips]) {
    if (c.start < t - EPS && clipEnd(c) > t + EPS) {
      const right = cloneClip(c);
      right.id = newId(tl);
      const off = t - c.start;
      setLen(c, off);
      trimHead(right, off);
      right.start = r6(t);
      c.fadeOut = 0; right.fadeIn = 0;
      track.clips.push(right);
    }
  }
}
const unlocked = (seq: Sequence) => seq.tracks.filter((t) => !t.locked);
const syncTracks = (seq: Sequence, also: Track[] = []) => [...new Set([...also, ...seq.tracks.filter((t) => t.syncLock !== false)])].filter((t) => !t.locked);
const sortTracks = (seq: Sequence) => { for (const t of seq.tracks) t.clips.sort((a, b) => a.start - b.start); };

/** Open a gap of `len` at t on every sync-locked track (plus `also`). */
function openGap(tl: Timeline, seq: Sequence, t: number, len: number, also: Track[] = []) {
  const tracks = syncTracks(seq, also);
  splitAt(tl, tracks, t);
  shiftAfter(seq, tracks, t, len);
}
/** Remove [a, b) from the given tracks and pull everything after it left on sync-locked tracks. */
function closeRange(tl: Timeline, seq: Sequence, a: number, b: number, tracks: Track[]) {
  const all = syncTracks(seq, tracks);
  for (const t of all) cutTrack(tl, t, a, b);
  // markers inside the removed range go to its start
  for (const k of seq.markers) if (k.t > a + EPS && k.t < b - EPS) k.t = r6(a);
  shiftAfter(seq, all, b, -(b - a));
}

// ------------------------------------------------------------------ track targeting
/** Targeted tracks. If nothing in the sequence is targeted (older projects), the first unlocked video and audio tracks are. */
export function targetTracks(seq: Sequence) {
  const any = seq.tracks.some((t) => t.targeted);
  const pick = (kind: "video" | "audio") => any
    ? seq.tracks.find((t) => t.kind === kind && t.targeted && !t.locked) || null
    : seq.tracks.find((t) => t.kind === kind && !t.locked) || null;
  const video = pick("video"), audio = pick("audio");
  return { video, audio, all: [video, audio].filter(Boolean) as Track[] };
}

// ------------------------------------------------------------------ three-point editing
export type Marks = { in?: number; out?: number };
export interface SourceRange { media?: string; seq?: string; in: number; out: number }

/**
 * Resolve a three-point edit. Any three of source In/Out and timeline In/Out decide the fourth;
 * with fewer, the playhead stands in for timeline In and the whole source for missing marks.
 */
export function threePoint(src: Marks, srcDuration: number, timeline: Marks, playhead: number) {
  const sIn = src.in, sOut = src.out, tIn = timeline.in, tOut = timeline.out;
  let len: number, a: number, at: number;
  if (tIn !== undefined && tOut !== undefined && tOut > tIn) {
    len = tOut - tIn; at = tIn;
    a = sIn !== undefined ? sIn : sOut !== undefined ? sOut - len : 0;
  } else {
    a = sIn ?? 0;
    const b = sOut ?? srcDuration;
    len = b - a;
    if (tOut !== undefined && tIn === undefined) at = tOut - len; // backtime from the timeline Out
    else at = tIn ?? playhead;
  }
  a = Math.max(0, a);
  if (Number.isFinite(srcDuration)) len = Math.min(len, srcDuration - a);
  return { in: r6(a), out: r6(a + len), at: r6(Math.max(0, at)), len: r6(len) };
}

function placeSource(tl: Timeline, seq: Sequence, src: SourceRange, at: number, targets: ReturnType<typeof targetTracks>) {
  const len = src.out - src.in;
  const ids: string[] = [];
  if (src.seq) {
    if (!targets.video) return { ids, error: "No unlocked video track is targeted." };
    const c: NestedClip = { id: newId(tl), seq: src.seq, start: r6(at), in: r6(src.in), out: r6(src.out), volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0 };
    targets.video.clips.push(c);
    return { ids: [c.id] };
  }
  const m = tl.media.find((x) => x.id === src.media);
  if (!m) return { ids, error: `media ${src.media} doesn't exist` };
  const link = m.type === "video" && m.hasAudio && targets.video && targets.audio ? freshLink(tl, `c${tl.nextId}`) : undefined;
  const base = { media: m.id, start: r6(at), in: r6(src.in), out: r6(src.in + len), volume: 1, fadeIn: 0, fadeOut: 0 };
  if (m.type !== "audio") {
    if (!targets.video) return { ids, error: "No unlocked video track is targeted." };
    const v: MediaClip = { id: newId(tl), ...base, fit: "cover", ...(link ? { link } : {}) };
    targets.video.clips.push(v); ids.push(v.id);
  }
  if (m.type === "audio" || link) {
    if (!targets.audio) return { ids, error: "No unlocked audio track is targeted." };
    const a: MediaClip = { id: newId(tl), ...base, ...(link ? { link } : {}) };
    targets.audio.clips.push(a); ids.push(a.id);
  }
  return { ids };
}
const touchedTracks = (seq: Sequence, src: SourceRange, tl: Timeline, tg: ReturnType<typeof targetTracks>) => {
  const m = src.media ? tl.media.find((x) => x.id === src.media) : undefined;
  const out: Track[] = [];
  if ((src.seq || m?.type !== "audio") && tg.video) out.push(tg.video);
  if (((m?.type === "video" && m.hasAudio) || m?.type === "audio") && tg.audio) out.push(tg.audio);
  return out;
};

/** Insert (,): push everything at `at` later on sync-locked tracks and drop the source in. */
export function insert(tl0: Timeline, src: SourceRange, at: number): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const tg = targetTracks(seq);
  at = grid(seq, at);
  const len = grid(seq, src.out - src.in);
  if (len <= 0) return fail(tl0, "The source range is empty.");
  if (src.seq === seq.id) return fail(tl0, "A sequence can't be inserted into itself.");
  openGap(tl, seq, at, len, touchedTracks(seq, src, tl, tg));
  const r = placeSource(tl, seq, { ...src, out: src.in + len }, at, tg);
  if (r.error) return fail(tl0, r.error);
  sortTracks(seq);
  return done(tl, r.ids);
}

/** Overwrite (.): replace whatever is on the targeted tracks for the source's length. */
export function overwrite(tl0: Timeline, src: SourceRange, at: number): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const tg = targetTracks(seq);
  at = grid(seq, at);
  const len = grid(seq, src.out - src.in);
  if (len <= 0) return fail(tl0, "The source range is empty.");
  if (src.seq === seq.id) return fail(tl0, "A sequence can't be cut into itself.");
  for (const t of touchedTracks(seq, src, tl, tg)) cutTrack(tl, t, at, at + len);
  const r = placeSource(tl, seq, { ...src, out: src.in + len }, at, tg);
  if (r.error) return fail(tl0, r.error);
  sortTracks(seq);
  return done(tl, r.ids);
}

/** Append: put the source at the end of the sequence. */
export function append(tl: Timeline, src: SourceRange): Result {
  return overwrite(tl, src, sequenceDuration(seqOf(tl)));
}

/** Replace: the clip keeps its place and length; its source becomes `src` starting at src.in. */
export function replace(tl0: Timeline, clipId: string, src: SourceRange): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const f = locate(seq, clipId);
  if (!f || isText(f.clip)) return fail(tl0, "Select a picture or sound clip to replace.");
  if (f.track.locked) return fail(tl0, `${f.track.name} is locked.`);
  const len = clipLength(f.clip);
  const old = f.clip as MediaClip & NestedClip;
  const m = src.media ? tl.media.find((x) => x.id === src.media) : undefined;
  if (src.media && (!m || !acceptsMedia(f.track.kind, m.type))) return fail(tl0, `That media can't go on ${f.track.name}.`);
  const dur = src.seq ? sequenceDuration(seqOf(tl, src.seq)) : m?.type === "image" ? Infinity : m?.duration ?? Infinity;
  if (src.in + len > dur + EPS) return fail(tl0, `The source is too short: it needs ${len.toFixed(2)}s from its In point.`);
  const next: any = { id: old.id, start: old.start, in: r6(src.in), out: r6(src.in + len), volume: old.volume, fadeIn: old.fadeIn, fadeOut: old.fadeOut };
  if (src.seq) next.seq = src.seq; else next.media = src.media;
  if (f.track.kind === "video") next.fit = old.fit || "cover";
  if (old.label) next.label = old.label;
  f.track.clips[f.track.clips.indexOf(f.clip)] = next;
  return done(tl, [clipId]);
}

// ------------------------------------------------------------------ lift / extract / delete / gaps
/** Lift (;): remove the timeline In→Out range from the targeted tracks, leaving a gap. */
export function lift(tl0: Timeline, a: number, b: number, trackIds?: string[]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  if (b - a <= EPS) return fail(tl0, "Mark a timeline In and Out first (I, O).");
  const tracks = trackIds ? seq.tracks.filter((t) => trackIds.includes(t.id) && !t.locked) : targetTracks(seq).all;
  if (!tracks.length) return fail(tl0, "No targeted tracks.");
  for (const t of tracks) cutTrack(tl, t, a, b);
  sortTracks(seq);
  return done(tl);
}

/** Extract ('): remove the range and close it up (sync-locked tracks lose the same range). */
export function extract(tl0: Timeline, a: number, b: number, trackIds?: string[]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  if (b - a <= EPS) return fail(tl0, "Mark a timeline In and Out first (I, O).");
  const tracks = trackIds ? seq.tracks.filter((t) => trackIds.includes(t.id) && !t.locked) : targetTracks(seq).all;
  closeRange(tl, seq, a, b, tracks);
  if (seq.marks) delete seq.marks;
  sortTracks(seq);
  return done(tl);
}

/** Delete clips (and what's linked to them), leaving gaps. */
export function remove(tl0: Timeline, ids: string[], linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const all = new Set(withLinked(seq, ids, linked));
  for (const t of seq.tracks) {
    if (t.locked && t.clips.some((c) => all.has(c.id))) return fail(tl0, `${t.name} is locked.`);
    t.clips = t.clips.filter((c) => !all.has(c.id));
  }
  return done(tl);
}

/**
 * Ripple delete (⇧⌫): delete the clips and close the hole. Each contiguous stretch of deleted
 * time is removed from the clips' tracks and from every sync-locked track, as long as the
 * sync-locked tracks are empty there; otherwise only the clips' own tracks close up.
 */
export function rippleDelete(tl0: Timeline, ids: string[], linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const all = withLinked(seq, ids, linked);
  const found = all.map((id) => locate(seq, id)).filter(Boolean) as { clip: Clip; track: Track }[];
  if (!found.length) return fail(tl0, "Nothing selected.");
  const locked = found.find((f) => f.track.locked);
  if (locked) return fail(tl0, `${locked.track.name} is locked.`);
  const own = [...new Set(found.map((f) => f.track))];
  // merge the deleted spans, last first so earlier positions stay valid
  const spans = found.map((f) => [f.clip.start, clipEnd(f.clip)] as [number, number]).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1] + EPS) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
  for (const t of own) t.clips = t.clips.filter((c) => !all.includes(c.id));
  const notes: string[] = [];
  for (const [a, b] of merged.reverse()) {
    // only close up where the clips' own tracks are now empty
    const others = syncTracks(seq).filter((t) => !own.includes(t));
    const blocked = others.filter((t) => t.clips.some((c) => c.start < b - EPS && clipEnd(c) > a + EPS));
    const shiftTracks = [...own, ...others.filter((t) => !blocked.includes(t))];
    for (const t of own) if (t.clips.some((c) => c.start < b - EPS && clipEnd(c) > a + EPS)) { notes.push("left a gap where other clips overlapped"); continue; }
    if (blocked.length) notes.push(`${blocked.map((t) => t.name).join(", ")} had something there, so ${blocked.length > 1 ? "they" : "it"} didn't move`);
    shiftAfter(seq, shiftTracks, b, -(b - a), !blocked.length);
  }
  sortTracks(seq);
  return done(tl, [], notes.length ? [...new Set(notes)].join("; ") : undefined);
}

/** The empty stretch on a track around time t, or null. */
export function gapAt(seq: Sequence, trackId: string, t: number): [number, number] | null {
  const track = seq.tracks.find((x) => x.id === trackId);
  if (!track) return null;
  let a = 0, b = Infinity;
  for (const c of track.clips) {
    if (c.start <= t + EPS && clipEnd(c) > t + EPS) return null;
    if (clipEnd(c) <= t + EPS) a = Math.max(a, clipEnd(c));
    if (c.start > t + EPS) b = Math.min(b, c.start);
  }
  return Number.isFinite(b) ? [r6(a), r6(b)] : null;
}

/** Ripple-delete a gap (select the gap and ⌫): sync-locked tracks must be empty there too. */
export function closeGap(tl0: Timeline, trackId: string, t: number): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const g = gapAt(seq, trackId, t);
  if (!g) return fail(tl0, "There's no gap there.");
  const track = seq.tracks.find((x) => x.id === trackId)!;
  if (track.locked) return fail(tl0, `${track.name} is locked.`);
  const [a, b] = g;
  const tracks = syncTracks(seq, [track]);
  const blocked = tracks.filter((x) => x !== track && x.clips.some((c) => c.start < b - EPS && clipEnd(c) > a + EPS));
  if (blocked.length) return fail(tl0, `Can't close it: ${blocked.map((x) => x.name).join(", ")} ${blocked.length > 1 ? "have" : "has"} clips in that gap. Turn their sync lock off to close it anyway.`);
  shiftAfter(seq, tracks, b, -(b - a));
  sortTracks(seq);
  return done(tl);
}

/** Close every gap on a track (only that track moves; linked partners come along). */
export function closeAllGaps(tl0: Timeline, trackId: string): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const track = seq.tracks.find((x) => x.id === trackId);
  if (!track) return fail(tl0, "No such track.");
  if (track.locked) return fail(tl0, `${track.name} is locked.`);
  let cursor = 0;
  const moved: Record<string, number> = {};
  for (const c of [...track.clips].sort((x, y) => x.start - y.start)) {
    const d = r6(cursor - c.start);
    if (d < 0) moved[c.id] = d;
    c.start = r6(Math.min(c.start, cursor));
    cursor = Math.max(cursor, clipEnd(c));
  }
  // linked partners on other tracks follow
  for (const [id, d] of Object.entries(moved)) for (const pid of linkedIds(seq, id)) {
    if (pid === id) continue;
    const p = locate(seq, pid);
    if (p && p.track !== track && !p.track.locked) p.clip.start = r6(Math.max(0, p.clip.start + d));
  }
  sortTracks(seq);
  return done(tl);
}

// ------------------------------------------------------------------ blade / split
export function blade(tl0: Timeline, t: number, trackIds?: string[]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  t = grid(seq, t);
  const tracks = unlocked(seq).filter((x) => !trackIds || trackIds.includes(x.id));
  const before = tl.nextId;
  splitAt(tl, tracks, t);
  if (tl.nextId === before) return fail(tl0, "No clip under the playhead to cut.");
  // pieces of a linked pair stay linked, but as a new pair on the right
  const fresh = new Set<string>();
  for (const track of tracks) for (const c of track.clips) {
    const n = Number(c.id.slice(1));
    if (n >= before && !isText(c) && (c as MediaClip).link) fresh.add((c as MediaClip).link!);
  }
  for (const l of fresh) for (const track of tracks) for (const c of track.clips) {
    const n = Number(c.id.slice(1));
    if (n >= before && (c as MediaClip).link === l) (c as MediaClip).link = `${l}r${before}`;
  }
  sortTracks(seq);
  return done(tl);
}

// ------------------------------------------------------------------ trimming tools
function clampEdge(tl: Timeline, c: Clip, edge: "start" | "end", delta: number, minLen: number) {
  const len = clipLength(c);
  if (edge === "start") {
    let d = Math.min(delta, len - minLen);                      // can't shrink past minLen
    if (!isText(c)) d = Math.max(d, -(c as MediaClip).in);      // can't reveal before the source starts
    d = Math.max(d, -c.start);
    return d;
  }
  let d = Math.max(delta, -(len - minLen));
  if (!isText(c)) d = Math.min(d, mediaDur(tl, c) - (c as MediaClip).out);
  return d;
}
function moveEdge(c: Clip, edge: "start" | "end", d: number) {
  if (edge === "start") {
    c.start = r6(c.start + d);
    if (isText(c)) c.duration = r6(c.duration - d); else (c as MediaClip).in = r6((c as MediaClip).in + d);
  } else if (isText(c)) c.duration = r6(c.duration + d);
  else (c as MediaClip).out = r6((c as MediaClip).out + d);
}

/** Plain trim (Selection tool): move one edge; leaves gaps, linked clips follow unless `linked:false`. */
export function trim(tl0: Timeline, clipId: string, edge: "start" | "end", delta: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const ids = withLinked(seq, [clipId], linked);
  const fs = ids.map((id) => locate(seq, id)!).filter((f) => f && !f.track.locked);
  if (!fs.length) return fail(tl0, "That track is locked.");
  const min = 1 / seq.fps;
  let d = delta;
  for (const f of fs) {
    const x = clampEdge(tl, f.clip, edge, d, min); d = delta > 0 ? Math.min(d, x) : Math.max(d, x);
    // growing a clip stops at its neighbour (to overlap it, use Roll: ⌥ + Roll makes a J/L cut)
    if (edge === "start" && d < 0) { const prev = Math.max(0, ...f.track.clips.filter((c) => c !== f.clip && clipEnd(c) <= f.clip.start + EPS).map(clipEnd)); d = Math.max(d, prev - f.clip.start); }
    if (edge === "end" && d > 0) { const next = Math.min(Infinity, ...f.track.clips.filter((c) => c !== f.clip && c.start >= clipEnd(f.clip) - EPS).map((c) => c.start)); d = Math.min(d, next - clipEnd(f.clip)); }
  }
  d = grid(seq, d);
  if (Math.abs(d) < EPS) return fail(tl0, edge === "start" && delta < 0 || edge === "end" && delta > 0 ? "It's up against the next clip. Use Roll (N) to move the cut, ⌥ for one side only (J/L cut)." : "Can't trim further.");
  for (const f of fs) moveEdge(f.clip, edge, d);
  sortTracks(seq);
  return done(tl, ids);
}

/**
 * Ripple trim (Ripple tool, Q/W): move an edge and shift everything after it on this track and
 * sync-locked tracks, so no gap opens and nothing after it is overwritten.
 */
export function rippleTrim(tl0: Timeline, clipId: string, edge: "start" | "end", delta: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const ids = withLinked(seq, [clipId], linked);
  const fs = ids.map((id) => locate(seq, id)!).filter(Boolean);
  if (fs.some((f) => f.track.locked)) return fail(tl0, "That track is locked.");
  const min = 1 / seq.fps;
  let d = delta;
  for (const f of fs) { const x = clampEdge(tl, f.clip, edge, d, min); d = delta > 0 ? Math.min(d, x) : Math.max(d, x); }
  d = grid(seq, d);
  if (Math.abs(d) < EPS) return fail(tl0, "Can't trim further.");
  const main = fs[0].clip;
  // Head trim by d: the clip stays put, its first d seconds go, everything after moves left d.
  // Tail trim by d: its end moves d, everything after follows.
  const point = edge === "start" ? main.start : clipEnd(main);
  const change = edge === "start" ? -d : d;
  const own = [...new Set(fs.map((f) => f.track))];
  for (const f of fs) { moveEdge(f.clip, edge, d); if (edge === "start") f.clip.start = r6(f.clip.start - d); }
  const ownIds = new Set(fs.map((f) => f.clip.id));
  const others = syncTracks(seq).filter((t) => !own.includes(t));
  let threshold = point;
  if (change < 0) {
    const [ra, rb] = edge === "start" ? [point, point - change] : [point + change, point];
    for (const t of others) cutTrack(tl, t, ra, rb);
    for (const k of seq.markers) if (k.t > ra + EPS && k.t < rb - EPS) k.t = r6(ra);
    threshold = rb;
  } else splitAt(tl, others, point);
  for (const t of [...own, ...others]) for (const c of t.clips) if (!ownIds.has(c.id) && c.start >= threshold - EPS) c.start = r6(Math.max(0, c.start + change));
  for (const k of seq.markers) if (k.t >= threshold - EPS) k.t = r6(Math.max(0, k.t + change));
  sortTracks(seq);
  return done(tl, ids);
}

/** Roll (N): move the cut between two touching clips; the total length doesn't change. */
export function roll(tl0: Timeline, leftId: string, delta: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const leftIds = withLinked(seq, [leftId], linked);
  const pairs: { L: Clip; R: Clip }[] = [];
  for (const id of leftIds) {
    const f = locate(seq, id);
    if (!f || f.track.locked) continue;
    const R = f.track.clips.find((c) => Math.abs(c.start - clipEnd(f.clip)) < EPS * 10 && c.id !== f.clip.id);
    if (R) pairs.push({ L: f.clip, R });
  }
  if (!pairs.length) return fail(tl0, "Roll needs two clips that touch.");
  const min = 1 / seq.fps;
  let d = delta;
  for (const { L, R } of pairs) {
    const a = clampEdge(tl, L, "end", d, min), b = clampEdge(tl, R, "start", d, min);
    d = delta > 0 ? Math.min(d, a, b) : Math.max(d, a, b);
  }
  d = grid(seq, d);
  if (Math.abs(d) < EPS) return fail(tl0, "Can't roll further.");
  for (const { L, R } of pairs) { moveEdge(L, "end", d); moveEdge(R, "start", d); }
  sortTracks(seq);
  return done(tl, pairs.flatMap((p) => [p.L.id, p.R.id]));
}

/** Slip (Y): same place and length, different part of the source. */
export function slip(tl0: Timeline, clipId: string, delta: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const fs = withLinked(seq, [clipId], linked).map((id) => locate(seq, id)!).filter((f) => f && !isText(f.clip));
  if (!fs.length) return fail(tl0, "Slip works on picture and sound clips.");
  if (fs.some((f) => f.track.locked)) return fail(tl0, "That track is locked.");
  let d = delta;
  for (const f of fs) {
    const c = f.clip as MediaClip;
    d = Math.max(d, -c.in);
    d = Math.min(d, mediaDur(tl, c) - c.out);
  }
  d = grid(seq, d);
  if (Math.abs(d) < EPS) return fail(tl0, "There's no more source to slip into.");
  for (const f of fs) { const c = f.clip as MediaClip; c.in = r6(c.in + d); c.out = r6(c.out + d); }
  return done(tl, fs.map((f) => f.clip.id));
}

/** Slide (U): move the clip between its neighbours; they trim to make room. */
export function slide(tl0: Timeline, clipId: string, delta: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const fs = withLinked(seq, [clipId], linked).map((id) => locate(seq, id)!).filter(Boolean);
  if (fs.some((f) => f.track.locked)) return fail(tl0, "That track is locked.");
  const min = 1 / seq.fps;
  const plan = fs.map(({ clip, track }) => ({
    clip,
    prev: track.clips.find((c) => c !== clip && Math.abs(clipEnd(c) - clip.start) < 1e-4),
    next: track.clips.find((c) => c !== clip && Math.abs(c.start - clipEnd(clip)) < 1e-4),
  }));
  let d = delta;
  for (const p of plan) {
    d = Math.max(d, -p.clip.start);
    if (p.prev) { const x = clampEdge(tl, p.prev, "end", d, min); d = delta > 0 ? Math.min(d, x) : Math.max(d, x); }
    if (p.next) { const x = clampEdge(tl, p.next, "start", d, min); d = delta > 0 ? Math.min(d, x) : Math.max(d, x); }
  }
  d = grid(seq, d);
  if (Math.abs(d) < EPS) return fail(tl0, "Can't slide further.");
  for (const p of plan) {
    if (p.prev) moveEdge(p.prev, "end", d);
    if (p.next) moveEdge(p.next, "start", d);
    p.clip.start = r6(p.clip.start + d);
  }
  sortTracks(seq);
  return done(tl, plan.map((p) => p.clip.id));
}

/** Nudge: move clips by whole frames (⌥← / ⌥→; with ⇧, 5 frames). */
export function nudge(tl0: Timeline, ids: string[], frames: number, linked = true): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const all = withLinked(seq, ids, linked).map((id) => locate(seq, id)!).filter(Boolean);
  if (!all.length) return fail(tl0, "Select clips to nudge.");
  if (all.some((f) => f.track.locked)) return fail(tl0, "That track is locked.");
  let d = frames / seq.fps;
  for (const f of all) d = Math.max(d, -f.clip.start);
  if (Math.abs(d) < EPS) return fail(tl0, "Already at the start.");
  for (const f of all) f.clip.start = grid(seq, f.clip.start + d);
  sortTracks(seq);
  return done(tl, all.map((f) => f.clip.id));
}

// ------------------------------------------------------------------ linking
export function link(tl0: Timeline, ids: string[]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const fs = ids.map((id) => locate(seq, id)).filter((f) => f && !isText(f.clip)) as { clip: MediaClip; track: Track }[];
  if (fs.length < 2) return fail(tl0, "Select a picture clip and its sound (two or more clips) to link.");
  const l = freshLink(tl, fs[0].clip.id);
  for (const f of fs) f.clip.link = l;
  return done(tl, fs.map((f) => f.clip.id));
}
export function unlink(tl0: Timeline, ids: string[]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const all = withLinked(seq, ids);
  let n = 0;
  for (const id of all) { const f = locate(seq, id); if (f && !isText(f.clip) && (f.clip as MediaClip).link) { delete (f.clip as MediaClip).link; n++; } }
  if (!n) return fail(tl0, "Those clips aren't linked.");
  return done(tl, all);
}

// ------------------------------------------------------------------ sequences & nesting
const nextSeqId = (tl: Timeline) => { let n = 1; while (tl.sequences.some((s) => s.id === `s${n}`)) n++; return `s${n}`; };
const blankTracks = (src?: Sequence): Track[] => (src ? src.tracks.map((t) => ({ ...t, clips: [] })) : [
  { id: "v1", kind: "video", name: "Video 1", muted: false, hidden: false, locked: false, solo: false, volume: 1, syncLock: true, targeted: true, clips: [] },
  { id: "a1", kind: "audio", name: "Audio 1", muted: false, hidden: false, locked: false, solo: false, volume: 1, syncLock: true, targeted: true, clips: [] },
  { id: "t1", kind: "text", name: "Text 1", muted: false, hidden: false, locked: false, solo: false, volume: 1, syncLock: true, targeted: false, clips: [] },
]);

export function newSequence(tl0: Timeline, name: string, like?: Partial<Pick<Sequence, "width" | "height" | "fps">>): Result {
  const tl = structuredClone(tl0);
  const cur = seqOf(tl);
  const s: Sequence = { id: nextSeqId(tl), name, width: like?.width ?? cur.width, height: like?.height ?? cur.height, fps: like?.fps ?? cur.fps, background: cur.background, markers: [], tracks: blankTracks() };
  tl.sequences.push(s);
  tl.activeSequence = s.id;
  return done(tl, [s.id]);
}

export function renameSequence(tl0: Timeline, id: string, name: string): Result {
  const tl = structuredClone(tl0);
  seqOf(tl, id).name = name;
  return done(tl);
}

export function deleteSequence(tl0: Timeline, id: string): Result {
  if (tl0.sequences.length < 2) return fail(tl0, "A project needs at least one sequence.");
  const users = tl0.sequences.filter((s) => s.tracks.some((t) => t.clips.some((c) => isNested(c) && c.seq === id)));
  if (users.length) return fail(tl0, `${seqOf(tl0, id).name} is used inside ${users.map((s) => s.name).join(", ")}. Remove those nested clips first.`);
  const tl = structuredClone(tl0);
  tl.sequences = tl.sequences.filter((s) => s.id !== id);
  if (tl.activeSequence === id) tl.activeSequence = tl.sequences[0].id;
  return done(tl);
}

/** Duplicate the active sequence as a new version: "Main" → "Main v2". Every clip gets a new id. */
export function duplicateAsVersion(tl0: Timeline, name?: string): Result {
  const tl = structuredClone(tl0);
  const src = seqOf(tl);
  const base = src.name.replace(/\s+v\d+$/, "");
  let v = 2;
  while (tl.sequences.some((s) => s.name === `${base} v${v}`)) v++;
  const copy: Sequence = structuredClone(src);
  copy.id = nextSeqId(tl);
  copy.name = name || `${base} v${v}`;
  const linkMap = new Map<string, string>();
  for (const t of copy.tracks) for (const c of t.clips) {
    c.id = newId(tl);
    const m = c as MediaClip;
    if (m.markers) for (const k of m.markers) k.id = newId(tl, "k");
    if (m.link) { if (!linkMap.has(m.link)) linkMap.set(m.link, `L${c.id.slice(1)}`); m.link = linkMap.get(m.link); }
  }
  for (const k of copy.markers) k.id = newId(tl, "k");
  tl.sequences.push(copy);
  tl.activeSequence = copy.id;
  return done(tl, [copy.id]);
}

/**
 * Nest (⌥G): move the selected clips into a new sequence and put one nested clip in their place
 * (on the lowest video track they used). Its picture and sound play as one clip.
 */
export function nest(tl0: Timeline, ids: string[], name?: string): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const all = withLinked(seq, ids);
  const fs = all.map((id) => locate(seq, id)).filter(Boolean) as { clip: Clip; track: Track }[];
  if (!fs.length) return fail(tl0, "Select the clips to nest.");
  if (fs.some((f) => f.track.locked)) return fail(tl0, "One of those tracks is locked.");
  const a = Math.min(...fs.map((f) => f.clip.start));
  const b = Math.max(...fs.map((f) => clipEnd(f.clip)));
  const n = tl.sequences.filter((s) => /^Nested \d+$/.test(s.name)).length + 1;
  const child: Sequence = { id: nextSeqId(tl), name: name || `Nested ${n}`, width: seq.width, height: seq.height, fps: seq.fps, background: seq.background, markers: [], tracks: [] };
  const used = new Set(fs.map((f) => f.track.id));
  for (const t of seq.tracks) {
    if (!used.has(t.id)) continue;
    const moving = t.clips.filter((c) => all.includes(c.id));
    t.clips = t.clips.filter((c) => !all.includes(c.id));
    child.tracks.push({ ...t, locked: false, solo: false, muted: false, hidden: false, volume: 1, clips: moving.map((c) => ({ ...c, start: r6(c.start - a) })) });
  }
  if (!child.tracks.some((t) => t.kind === "video")) child.tracks.unshift({ ...blankTracks()[0] });
  tl.sequences.push(child);
  const home = seq.tracks.find((t) => used.has(t.id) && t.kind === "video") || seq.tracks.find((t) => t.kind === "video" && !t.locked);
  if (!home) return fail(tl0, "Nesting needs a video track to hold the nested clip.");
  const clip: NestedClip = { id: newId(tl), seq: child.id, start: r6(a), in: 0, out: r6(b - a), volume: 1, fit: "cover", fadeIn: 0, fadeOut: 0, label: child.name };
  home.clips.push(clip);
  sortTracks(seq);
  return done(tl, [clip.id, child.id]);
}

// ------------------------------------------------------------------ markers
export const MARKER_COLORS = { olive: "#A8B118", blush: "#EBB9BA", berry: "#8C0532", tan: "#B68A71", sage: "#B4AD7F", cream: "#F0DAC2" } as const;
export type MarkerInput = Partial<Omit<Marker, "id">> & { t: number };

/** Add a sequence marker (or, with clipId, a clip marker at that source time). */
export function addMarker(tl0: Timeline, m: MarkerInput, clipId?: string): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const k: Marker = { id: newId(tl, "k"), t: r6(Math.max(0, m.t)), duration: r6(m.duration ?? 0), name: m.name ?? "", color: m.color ?? (m.type === "claude" ? "blush" : m.type === "chapter" ? "berry" : m.type === "todo" ? "tan" : "olive"), type: m.type ?? "comment" };
  if (m.note) k.note = m.note;
  if (m.done !== undefined) k.done = m.done;
  if (clipId) {
    const f = locate(seq, clipId);
    if (!f || isText(f.clip)) return fail(tl0, "Clip markers go on picture or sound clips.");
    const c = f.clip as MediaClip;
    (c.markers ||= []).push(k);
  } else seq.markers.push(k);
  return done(tl, [k.id]);
}
function findMarker(seq: Sequence, id: string): { list: Marker[]; k: Marker } | null {
  let k = seq.markers.find((x) => x.id === id);
  if (k) return { list: seq.markers, k };
  for (const t of seq.tracks) for (const c of t.clips) {
    const ms = (c as MediaClip).markers;
    k = ms?.find((x) => x.id === id);
    if (k) return { list: ms!, k };
  }
  return null;
}
export function updateMarker(tl0: Timeline, id: string, patch: Partial<Omit<Marker, "id">>): Result {
  const tl = structuredClone(tl0);
  const f = findMarker(seqOf(tl), id);
  if (!f) return fail(tl0, `marker ${id} doesn't exist`);
  for (const [key, v] of Object.entries(patch)) { if (v === undefined || v === "") delete (f.k as any)[key]; else (f.k as any)[key] = v; }
  if (!f.k.name) f.k.name = "";
  return done(tl, [id]);
}
export function deleteMarker(tl0: Timeline, id: string): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const f = findMarker(seq, id);
  if (!f) return fail(tl0, `marker ${id} doesn't exist`);
  f.list.splice(f.list.indexOf(f.k), 1);
  for (const t of seq.tracks) for (const c of t.clips) if ((c as MediaClip).markers?.length === 0) delete (c as MediaClip).markers;
  return done(tl);
}
/** Every marker in the sequence on the timeline clock (clip markers placed where they play). */
export function allMarkers(seq: Sequence): (Marker & { clipId?: string; at: number })[] {
  const out: (Marker & { clipId?: string; at: number })[] = seq.markers.map((k) => ({ ...k, at: k.t }));
  for (const t of seq.tracks) for (const c of t.clips) {
    const ms = (c as MediaClip).markers;
    if (!ms) continue;
    for (const k of ms) {
      const at = c.start + (k.t - (c as MediaClip).in);
      if (at >= c.start - EPS && at <= clipEnd(c) + EPS) out.push({ ...k, clipId: c.id, at: r6(at) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
export function nextMarker(seq: Sequence, t: number, dir: 1 | -1) {
  const ms = allMarkers(seq);
  return dir > 0 ? ms.find((k) => k.at > t + EPS)?.at ?? null : [...ms].reverse().find((k) => k.at < t - EPS)?.at ?? null;
}

/**
 * YouTube chapters from chapter markers: "0:00 Intro" lines for the description. YouTube needs
 * the first at 0:00, at least three, each at least 10 s long; problems come back as warnings.
 */
export function youtubeChapters(seq: Sequence) {
  const ch = allMarkers(seq).filter((k) => k.type === "chapter");
  const warnings: string[] = [];
  const total = sequenceDuration(seq);
  const stamp = (t: number) => {
    const s = Math.floor(t + 1e-6), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
  };
  if (!ch.length) return { text: "", warnings: ["No chapter markers yet. Add markers with type Chapter."] };
  if (ch[0].at > 0.5) warnings.push(`The first chapter starts at ${stamp(ch[0].at)}; YouTube needs one at 0:00 (it was added as "Intro").`);
  const list = ch[0].at > 0.5 ? [{ at: 0, name: "Intro" }, ...ch] : ch;
  if (list.length < 3) warnings.push("YouTube needs at least 3 chapters.");
  list.forEach((k, i) => {
    const end = list[i + 1]?.at ?? total;
    if (k.at >= total - 1e-6) { warnings.push(`"${k.name || stamp(k.at)}" is after the end of the video (${stamp(total)}).`); return; }
    if (end - k.at < 10) warnings.push(`"${k.name || stamp(k.at)}" is ${(end - k.at).toFixed(1)}s; YouTube chapters must be at least 10 s.`);
  });
  return { text: list.map((k, i) => `${i === 0 ? "0:00" : stamp(k.at)} ${k.name || `Chapter ${i + 1}`}`).join("\n"), warnings };
}

/** Open "for Claude" notes, for `bge notes`. */
export function claudeNotes(tl: Timeline) {
  const out: { seq: string; id: string; at: string; name: string; note?: string; clipId?: string }[] = [];
  for (const s of tl.sequences) for (const k of allMarkers(s)) if (k.type === "claude" && !k.done) out.push({ seq: s.id, id: k.id, at: toTimecode(k.at, s.fps), name: k.name, note: k.note, clipId: k.clipId });
  return out;
}

export function setMarks(tl0: Timeline, marks: Marks | null): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const m = { ...(seq.marks || {}), ...(marks || {}) };
  if (!marks || (m.in === undefined && m.out === undefined)) delete seq.marks;
  else seq.marks = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [k, grid(seq, v as number)]));
  return done(tl);
}

// ------------------------------------------------------------------ clipboard
export interface ClipboardData { kind: "blkgrlco-clips"; from: string; items: { trackId: string; trackKind: Track["kind"]; clip: Clip }[] }

export function copy(tl: Timeline, ids: string[]): ClipboardData | null {
  const seq = seqOf(tl);
  const all = withLinked(seq, ids);
  const items = all.map((id) => locate(seq, id)).filter(Boolean).map((f) => ({ trackId: f!.track.id, trackKind: f!.track.kind, clip: structuredClone(f!.clip) }));
  return items.length ? { kind: "blkgrlco-clips", from: seq.id, items } : null;
}

/** Paste at `at` (the earliest copied clip lands there) on the same tracks, or the first of each kind. */
export function paste(tl0: Timeline, data: ClipboardData, at: number, mode: "overwrite" | "insert" = "overwrite"): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  if (!data.items.length) return fail(tl0, "The clipboard is empty.");
  const a = Math.min(...data.items.map((i) => i.clip.start));
  const b = Math.max(...data.items.map((i) => clipEnd(i.clip)));
  at = grid(seq, at);
  const dest = (i: ClipboardData["items"][number]) => {
    const same = seq.tracks.find((t) => t.id === i.trackId && t.kind === i.trackKind && !t.locked);
    return same || seq.tracks.find((t) => t.kind === i.trackKind && !t.locked);
  };
  for (const i of data.items) {
    if (isNested(i.clip) && (i.clip.seq === seq.id)) return fail(tl0, "A sequence can't be pasted into itself.");
    if (isMediaClip(i.clip) && !tl.media.some((m) => m.id === (i.clip as MediaClip).media)) return fail(tl0, "That clip's media isn't in this project.");
    if (!dest(i)) return fail(tl0, `No unlocked ${i.trackKind} track to paste onto.`);
  }
  const tracks = [...new Set(data.items.map((i) => dest(i)!))];
  if (mode === "insert") openGap(tl, seq, at, b - a, tracks);
  else for (const t of tracks) cutTrack(tl, t, at, at + (b - a));
  const linkMap = new Map<string, string>();
  const ids: string[] = [];
  for (const i of data.items) {
    const c = structuredClone(i.clip) as MediaClip;
    c.id = newId(tl);
    c.start = r6(at + (i.clip.start - a));
    if (c.link) { if (!linkMap.has(c.link)) linkMap.set(c.link, freshLink(tl, c.id)); c.link = linkMap.get(c.link); }
    if (c.markers) for (const k of c.markers) k.id = newId(tl, "k");
    dest(i)!.clips.push(c as Clip);
    ids.push(c.id);
  }
  sortTracks(seq);
  return done(tl, ids);
}

export type PasteAttr = "volume" | "fades" | "fit" | "style" | "label";
/** Paste attributes (⌥⌘V): copy volume / fades / fit / text style from the copied clip. */
export function pasteAttributes(tl0: Timeline, data: ClipboardData, ids: string[], attrs: PasteAttr[] = ["volume", "fades", "fit", "style"]): Result {
  const tl = structuredClone(tl0);
  const seq = seqOf(tl);
  const src = data.items[0]?.clip;
  if (!src) return fail(tl0, "Copy a clip first.");
  let n = 0;
  for (const id of ids) {
    const f = locate(seq, id);
    if (!f || f.track.locked || f.clip.id === src.id) continue;
    const c = f.clip as any, s = src as any;
    if (attrs.includes("volume") && !isText(c) && !isText(src)) c.volume = s.volume;
    if (attrs.includes("fades")) { c.fadeIn = Math.min(s.fadeIn, clipLength(c)); c.fadeOut = Math.min(s.fadeOut, clipLength(c)); }
    if (attrs.includes("fit") && f.track.kind === "video" && s.fit) c.fit = s.fit;
    if (attrs.includes("style") && isText(c) && isText(src)) (c as TextClip).style = { ...src.style };
    if (attrs.includes("label")) { if (s.label) c.label = s.label; else delete c.label; }
    n++;
  }
  if (!n) return fail(tl0, "Select the clips to paste onto.");
  return done(tl, ids);
}

// ------------------------------------------------------------------ match frame
/** Match frame (F): the source frame under the playhead on the top visible picture track. */
export function matchFrame(tl: Timeline, t: number, clipId?: string): { media?: string; seq?: string; time: number; clipId: string } | null {
  const seq = seqOf(tl);
  const pick = (c: Clip) => {
    const time = r6((c as MediaClip).in + (t - c.start));
    return isNested(c) ? { seq: c.seq, time, clipId: c.id } : { media: (c as MediaClip).media, time, clipId: c.id };
  };
  if (clipId) {
    const f = locate(seq, clipId);
    if (f && !isText(f.clip) && t >= f.clip.start - EPS && t < clipEnd(f.clip)) return pick(f.clip);
  }
  for (const kind of ["video", "audio"] as const) {
    for (const track of [...seq.tracks].reverse()) {
      if (track.kind !== kind || track.hidden) continue;
      const c = track.clips.find((x) => !isText(x) && t >= x.start - EPS && t < clipEnd(x));
      if (c) return pick(c);
    }
  }
  return null;
}

/** Clips at or after t (Track Select Forward, A); on one track with `trackId`. */
export function clipsFrom(seq: Sequence, t: number, trackId?: string) {
  const out: string[] = [];
  for (const tr of seq.tracks) if (!trackId || tr.id === trackId) for (const c of tr.clips) if (clipEnd(c) > t + EPS) out.push(c.id);
  return out;
}
