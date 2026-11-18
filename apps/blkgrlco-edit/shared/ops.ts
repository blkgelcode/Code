// Operations: the unit of change. Every edit — a drag in the UI, Claude rewriting
// timeline.json, an undo — becomes a list of ops addressed by id (never by array index),
// so edits from two people merge, and every op carries what it replaced so it can be undone.
import type { Timeline, Clip, Media, Sequence, Track } from "./model";
import { isText, mediaName, r6 } from "./model";

export type Target =
  | { kind: "timeline" }
  | { kind: "project" }
  | { kind: "media"; id: string }
  | { kind: "sequence"; id: string }
  | { kind: "track"; seq: string; id: string }
  | { kind: "clip"; id: string };

export type Op =
  | { t: "set"; target: Target; key: string; value: unknown; prev: unknown }
  | { t: "addMedia"; value: Media }
  | { t: "removeMedia"; value: Media }
  | { t: "addSequence"; value: Sequence; index: number }
  | { t: "removeSequence"; value: Sequence; index: number }
  | { t: "addTrack"; seq: string; value: Track; index: number }
  | { t: "removeTrack"; seq: string; value: Track; index: number }
  | { t: "addClip"; seq: string; track: string; value: Clip }
  | { t: "removeClip"; seq: string; track: string; value: Clip }
  | { t: "moveClip"; id: string; from: { seq: string; track: string }; to: { seq: string; track: string } }
  | { t: "reorderTracks"; seq: string; order: string[]; prev: string[] };

export class OpError extends Error {}

// ------------------------------------------------------------------ addressing
const tkey = (t: Target) =>
  t.kind === "timeline" ? "timeline" : t.kind === "project" ? "project" : t.kind === "track" ? `track:${t.seq}/${t.id}` : `${t.kind}:${t.id}`;

function locateClip(tl: Timeline, id: string) {
  for (const seq of tl.sequences) for (const track of seq.tracks) {
    const i = track.clips.findIndex((c) => c.id === id);
    if (i >= 0) return { seq, track, i, clip: track.clips[i] };
  }
  return null;
}
const seqOf = (tl: Timeline, id: string) => {
  const s = tl.sequences.find((x) => x.id === id);
  if (!s) throw new OpError(`sequence ${id} doesn't exist`);
  return s;
};
const trackOf = (tl: Timeline, seq: string, id: string) => {
  const t = seqOf(tl, seq).tracks.find((x) => x.id === id);
  if (!t) throw new OpError(`track ${id} doesn't exist in ${seq}`);
  return t;
};

function resolve(tl: Timeline, t: Target): any {
  switch (t.kind) {
    case "timeline": return tl;
    case "project": return tl.project;
    case "media": { const m = tl.media.find((x) => x.id === t.id); if (!m) throw new OpError(`media ${t.id} doesn't exist`); return m; }
    case "sequence": return seqOf(tl, t.id);
    case "track": return trackOf(tl, t.seq, t.id);
    case "clip": { const c = locateClip(tl, t.id); if (!c) throw new OpError(`clip ${t.id} doesn't exist`); return c.clip; }
  }
}

function getPath(obj: any, key: string) {
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: any, key: string, value: unknown) {
  const ks = key.split(".");
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] ?? (o[k] = {});
  const last = ks[ks.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

// ------------------------------------------------------------------ apply / invert
/** Apply ops to a copy of the timeline. Throws OpError if an op no longer fits. */
export function applyOps(tl: Timeline, ops: Op[]): Timeline {
  const out: Timeline = structuredClone(tl);
  for (const op of ops) applyOne(out, op);
  return out;
}

function applyOne(tl: Timeline, op: Op) {
  switch (op.t) {
    case "set": setPath(resolve(tl, op.target), op.key, structuredClone(op.value)); return;
    case "addMedia":
      if (tl.media.some((m) => m.id === op.value.id)) throw new OpError(`media ${op.value.id} already exists`);
      tl.media.push(structuredClone(op.value)); return;
    case "removeMedia": tl.media = tl.media.filter((m) => m.id !== op.value.id); return;
    case "addSequence":
      if (tl.sequences.some((s) => s.id === op.value.id)) throw new OpError(`sequence ${op.value.id} already exists`);
      tl.sequences.splice(Math.min(op.index, tl.sequences.length), 0, structuredClone(op.value)); return;
    case "removeSequence": tl.sequences = tl.sequences.filter((s) => s.id !== op.value.id); return;
    case "addTrack": {
      const s = seqOf(tl, op.seq);
      if (s.tracks.some((t) => t.id === op.value.id)) throw new OpError(`track ${op.value.id} already exists`);
      s.tracks.splice(Math.min(op.index, s.tracks.length), 0, structuredClone(op.value)); return;
    }
    case "removeTrack": { const s = seqOf(tl, op.seq); s.tracks = s.tracks.filter((t) => t.id !== op.value.id); return; }
    case "addClip": {
      if (locateClip(tl, op.value.id)) throw new OpError(`clip ${op.value.id} already exists`);
      trackOf(tl, op.seq, op.track).clips.push(structuredClone(op.value)); return;
    }
    case "removeClip": {
      const l = locateClip(tl, op.value.id);
      if (!l) throw new OpError(`clip ${op.value.id} doesn't exist`);
      l.track.clips.splice(l.i, 1); return;
    }
    case "moveClip": {
      const l = locateClip(tl, op.id);
      if (!l) throw new OpError(`clip ${op.id} doesn't exist`);
      const dest = trackOf(tl, op.to.seq, op.to.track);
      l.track.clips.splice(l.i, 1);
      dest.clips.push(l.clip); return;
    }
    case "reorderTracks": {
      const s = seqOf(tl, op.seq);
      const by = new Map(s.tracks.map((t) => [t.id, t]));
      const ordered = op.order.map((i) => by.get(i)).filter(Boolean) as Track[];
      const rest = s.tracks.filter((t) => !op.order.includes(t.id));
      s.tracks = [...ordered, ...rest]; return;
    }
  }
}

export function invert(op: Op): Op {
  switch (op.t) {
    case "set": return { ...op, value: op.prev, prev: op.value };
    case "addMedia": return { t: "removeMedia", value: op.value };
    case "removeMedia": return { t: "addMedia", value: op.value };
    case "addSequence": return { t: "removeSequence", value: op.value, index: op.index };
    case "removeSequence": return { t: "addSequence", value: op.value, index: op.index };
    case "addTrack": return { t: "removeTrack", seq: op.seq, value: op.value, index: op.index };
    case "removeTrack": return { t: "addTrack", seq: op.seq, value: op.value, index: op.index };
    case "addClip": return { t: "removeClip", seq: op.seq, track: op.track, value: op.value };
    case "removeClip": return { t: "addClip", seq: op.seq, track: op.track, value: op.value };
    case "moveClip": return { ...op, from: op.to, to: op.from };
    case "reorderTracks": return { ...op, order: op.prev, prev: op.order };
  }
}
export const invertAll = (ops: Op[]) => ops.slice().reverse().map(invert);

// ------------------------------------------------------------------ diff
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffObject(target: Target, a: any, b: any, skip: string[], ops: Op[], nested: string[] = []) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (skip.includes(k)) continue;
    if (nested.includes(k) && a?.[k] && b?.[k] && typeof a[k] === "object") {
      for (const sk of new Set([...Object.keys(a[k]), ...Object.keys(b[k])])) {
        if (!eq(a[k][sk], b[k][sk])) ops.push({ t: "set", target, key: `${k}.${sk}`, value: b[k][sk], prev: a[k][sk] });
      }
    } else if (!eq(a?.[k], b?.[k])) ops.push({ t: "set", target, key: k, value: b?.[k], prev: a?.[k] });
  }
}

/** The ops that turn timeline a into timeline b. nextId is managed by the server, not diffed. */
export function diff(a: Timeline, b: Timeline): Op[] {
  const ops: Op[] = [];
  if (a.activeSequence !== b.activeSequence) ops.push({ t: "set", target: { kind: "timeline" }, key: "activeSequence", value: b.activeSequence, prev: a.activeSequence });
  diffObject({ kind: "project" }, a.project, b.project, [], ops);

  // media
  const ma = new Map(a.media.map((m) => [m.id, m]));
  const mb = new Map(b.media.map((m) => [m.id, m]));
  for (const [id, m] of mb) if (!ma.has(id)) ops.push({ t: "addMedia", value: m });
  for (const [id, m] of ma) if (mb.has(id)) diffObject({ kind: "media", id }, m, mb.get(id), ["id"], ops);

  // clips (by id, across every sequence/track)
  const clipsOf = (tl: Timeline) => {
    const map = new Map<string, { clip: Clip; seq: string; track: string }>();
    for (const s of tl.sequences) for (const t of s.tracks) for (const c of t.clips) map.set(c.id, { clip: c, seq: s.id, track: t.id });
    return map;
  };
  const ca = clipsOf(a);
  const cb = clipsOf(b);

  const sa = new Map(a.sequences.map((s, i) => [s.id, { s, i }]));
  const sb = new Map(b.sequences.map((s, i) => [s.id, { s, i }]));
  const removeClips: Op[] = [], addSeqs: Op[] = [], addTracks: Op[] = [], moves: Op[] = [];
  const removeTracks: Op[] = [], removeSeqs: Op[] = [], addClips: Op[] = [], props: Op[] = [];
  for (const [id, x] of ca) if (!cb.has(id)) removeClips.push({ t: "removeClip", seq: x.seq, track: x.track, value: x.clip });
  for (const [sid, { s, i }] of sb) if (!sa.has(sid)) addSeqs.push({ t: "addSequence", value: { ...s, tracks: [] }, index: i });
  for (const [sid, { s }] of sb) {
    const before = sa.get(sid)?.s;
    s.tracks.forEach((t, i) => {
      if (!before || !before.tracks.some((x) => x.id === t.id)) addTracks.push({ t: "addTrack", seq: sid, value: { ...t, clips: [] }, index: i });
    });
  }
  for (const [id, x] of cb) {
    const old = ca.get(id);
    if (old && (old.seq !== x.seq || old.track !== x.track)) moves.push({ t: "moveClip", id, from: { seq: old.seq, track: old.track }, to: { seq: x.seq, track: x.track } });
    if (!old) addClips.push({ t: "addClip", seq: x.seq, track: x.track, value: x.clip });
  }
  for (const [sid, { s, i }] of sa) {
    const other = sb.get(sid)?.s;
    s.tracks.forEach((t, ti) => {
      if (!other || !other.tracks.some((x) => x.id === t.id)) removeTracks.push({ t: "removeTrack", seq: sid, value: { ...t, clips: [] }, index: ti });
    });
    if (!other) removeSeqs.push({ t: "removeSequence", value: { ...s, tracks: [] }, index: i });
  }
  for (const [sid, { s }] of sb) {
    const before = sa.get(sid)?.s;
    if (!before) continue;
    diffObject({ kind: "sequence", id: sid }, before, s, ["id", "tracks"], props);
    const ta = new Map(before.tracks.map((t) => [t.id, t]));
    for (const t of s.tracks) if (ta.has(t.id)) diffObject({ kind: "track", seq: sid, id: t.id }, ta.get(t.id), t, ["id", "clips"], props);
    const common = (tracks: Track[], other: Track[]) => tracks.map((t) => t.id).filter((x) => other.some((o) => o.id === x));
    if (!eq(common(before.tracks, s.tracks), common(s.tracks, before.tracks)))
      props.push({ t: "reorderTracks", seq: sid, order: s.tracks.map((t) => t.id), prev: before.tracks.map((t) => t.id) });
  }
  for (const [id, x] of cb) {
    const old = ca.get(id);
    if (old) diffObject({ kind: "clip", id }, old.clip, x.clip, ["id"], props, ["style"]);
  }
  ops.push(...removeClips, ...addSeqs, ...addTracks, ...moves, ...removeTracks, ...removeSeqs, ...addClips, ...props);
  // 5. media removals last (clips referencing them are gone by now)
  for (const [id, m] of ma) if (!mb.has(id)) ops.push({ t: "removeMedia", value: m });
  return ops;
}

// ------------------------------------------------------------------ conflicts
/** Keys an op touches, for conflict checks: "clip:c3.start", "clip:c3.*", … */
export function touched(op: Op): string[] {
  switch (op.t) {
    case "set": return [`${tkey(op.target)}.${op.key.split(".")[0] === "style" ? op.key : op.key}`];
    case "addMedia": case "removeMedia": return [`media:${op.value.id}.*`];
    case "addSequence": case "removeSequence": return [`sequence:${op.value.id}.*`];
    case "addTrack": case "removeTrack": return [`track:${op.seq}/${op.value.id}.*`, `sequence:${op.seq}.trackOrder`];
    case "addClip": case "removeClip": return [`clip:${op.value.id}.*`];
    case "moveClip": return [`clip:${op.id}.track`];
    case "reorderTracks": return [`sequence:${op.seq}.trackOrder`];
  }
}

const overlap = (a: string, b: string) => {
  if (a === b) return true;
  const wa = a.endsWith(".*") ? a.slice(0, -1) : null;
  const wb = b.endsWith(".*") ? b.slice(0, -1) : null;
  return (wa !== null && b.startsWith(wa)) || (wb !== null && a.startsWith(wb));
};

/** First key in `mine` that some op in `theirs` also touched, or null. */
export function conflictBetween(mine: Op[], theirs: Op[]): string | null {
  const their = theirs.flatMap(touched);
  for (const k of mine.flatMap(touched)) for (const o of their) if (overlap(k, o)) return k;
  return null;
}

// ------------------------------------------------------------------ descriptions
export const fmtTime = (s: number) => {
  if (!Number.isFinite(s)) return "–";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

/** 1 → "0 dB", 0.5 → "−6.0 dB", 0 → "−∞ dB" */
export const dbText = (v: number | undefined) => (v === undefined || v === 1 ? "0 dB" : v <= 0 ? "−∞ dB" : `${(20 * Math.log10(v)).toFixed(1).replace("-", "−")} dB`);

export interface Change { text: string; clipId?: string; trackId?: string; seq?: string }

/** Plain-words summary of ops, for the Activity panel. `tl` is the timeline AFTER the ops. */
export function describe(ops: Op[], before: Timeline, after: Timeline): Change[] {
  const out: Change[] = [];
  const mediaById = new Map([...before.media, ...after.media].map((m) => [m.id, m]));
  const trackName = (seq: string, id: string) =>
    (after.sequences.find((s) => s.id === seq) || before.sequences.find((s) => s.id === seq))?.tracks.find((t) => t.id === id)?.name || id;
  const clipWhat = (c: Clip) => (isText(c) ? `"${c.text.slice(0, 30)}"` : mediaById.get(c.media) ? mediaName(mediaById.get(c.media)!) : c.media);
  const setsByClip = new Map<string, Record<string, { value: any; prev: any }>>();
  for (const op of ops) {
    if (op.t === "set" && op.target.kind === "clip") {
      const m = setsByClip.get(op.target.id) || {};
      m[op.key] = { value: op.value, prev: op.prev };
      setsByClip.set(op.target.id, m);
    }
  }
  const newSeqs = new Set(ops.filter((o) => o.t === "addSequence").map((o) => (o as any).value.id as string));
  for (const op of ops) {
    if ((op.t === "addTrack" || op.t === "addClip") && newSeqs.has(op.seq)) continue;
    switch (op.t) {
      case "addClip": out.push({ text: `added ${op.value.id} (${clipWhat(op.value)}) on ${trackName(op.seq, op.track)} at ${fmtTime(op.value.start)}`, clipId: op.value.id, trackId: op.track, seq: op.seq }); break;
      case "removeClip": out.push({ text: `deleted ${op.value.id} (${clipWhat(op.value)}) from ${trackName(op.seq, op.track)}`, clipId: op.value.id, trackId: op.track, seq: op.seq }); break;
      case "moveClip": out.push({ text: `moved ${op.id} to ${trackName(op.to.seq, op.to.track)}`, clipId: op.id, seq: op.to.seq }); break;
      case "addTrack": out.push({ text: `added track ${op.value.name || op.value.id}`, trackId: op.value.id, seq: op.seq }); break;
      case "removeTrack": out.push({ text: `removed track ${op.value.name || op.value.id}`, trackId: op.value.id, seq: op.seq }); break;
      case "reorderTracks": out.push({ text: `reordered tracks`, seq: op.seq }); break;
      case "addMedia": out.push({ text: `imported ${mediaName(op.value)}` }); break;
      case "removeMedia": out.push({ text: `removed ${mediaName(op.value)} from the media list` }); break;
      case "addSequence": {
        const n = ops.filter((o) => o.t === "addClip" && o.seq === op.value.id).length;
        out.push({ text: `added sequence ${op.value.name}${n ? ` (${n} clip${n > 1 ? "s" : ""})` : ""}`, seq: op.value.id }); break;
      }
      case "removeSequence": out.push({ text: `removed sequence ${op.value.name}`, seq: op.value.id }); break;
      case "set": {
        const tg = op.target;
        if (tg.kind === "clip") break; // grouped below
        if (tg.kind === "track") {
          const name = trackName(tg.seq, tg.id);
          if (op.key === "muted") out.push({ text: `${name} ${op.value ? "muted" : "unmuted"}`, trackId: tg.id, seq: tg.seq });
          else if (op.key === "hidden") out.push({ text: `${name} ${op.value ? "hidden" : "shown"}`, trackId: tg.id, seq: tg.seq });
          else if (op.key === "locked") out.push({ text: `${name} ${op.value ? "locked" : "unlocked"}`, trackId: tg.id, seq: tg.seq });
          else if (op.key === "solo") out.push({ text: `${name} ${op.value ? "soloed" : "unsoloed"}`, trackId: tg.id, seq: tg.seq });
          else if (op.key === "volume") out.push({ text: `${name} fader ${dbText(op.prev as number)} → ${dbText(op.value as number)}`, trackId: tg.id, seq: tg.seq });
          else out.push({ text: `${name}: ${op.key} → ${JSON.stringify(op.value)}`, trackId: tg.id, seq: tg.seq });
        } else if (tg.kind === "timeline" && op.key === "activeSequence") out.push({ text: `switched to sequence ${op.value}` });
        else if (tg.kind === "media" && op.key === "path") {
          const name = mediaById.get(tg.id) ? mediaName(mediaById.get(tg.id)!) : tg.id;
          const where = String(op.value).split(/[\\/]/).slice(-4, -1).join("/");
          out.push({ text: `reconnected ${tg.id} (${name}) at …/${where}` });
        }
        else if (tg.kind === "media") out.push({ text: `${tg.id}: ${op.key} updated` });
        else out.push({ text: `${tg.kind === "sequence" ? `sequence ${tg.id}` : tg.kind}: ${op.key} → ${JSON.stringify(op.value)}` });
      }
    }
  }
  for (const [cid, k] of setsByClip) {
    const parts: string[] = [];
    const v = (key: string) => k[key];
    if (v("start") && !v("in")) parts.push(`moved ${fmtTime(v("start").prev)} → ${fmtTime(v("start").value)}`);
    if (v("in") || v("out")) {
      const p: string[] = [];
      if (v("in")) p.push(`in ${r6(v("in").prev)}s → ${r6(v("in").value)}s`);
      if (v("out")) p.push(`out ${r6(v("out").prev)}s → ${r6(v("out").value)}s`);
      parts.push(`trimmed: ${p.join(", ")}`);
    }
    if (v("duration")) parts.push(`length ${r6(v("duration").prev)}s → ${r6(v("duration").value)}s`);
    if (v("text")) parts.push(`text → "${String(v("text").value).slice(0, 40)}"`);
    if (v("volume")) parts.push(`volume ${v("volume").prev ?? 1} → ${v("volume").value ?? 1}`);
    if (v("fadeIn") || v("fadeOut")) parts.push(`fades ${[v("fadeIn") && `in ${v("fadeIn").value}s`, v("fadeOut") && `out ${v("fadeOut").value}s`].filter(Boolean).join(", ")}`);
    if (v("fit")) parts.push(`fit → ${v("fit").value}`);
    if (v("label")) parts.push(`label → "${v("label").value ?? ""}"`);
    const style = Object.keys(k).filter((x) => x.startsWith("style.")).map((x) => x.slice(6));
    if (style.length) parts.push(`style: ${style.join(", ")}`);
    const other = Object.keys(k).filter((x) => !["start", "in", "out", "duration", "text", "volume", "fadeIn", "fadeOut", "fit", "label"].includes(x) && !x.startsWith("style."));
    if (other.length) parts.push(other.join(", ") + " changed");
    if (parts.length) out.push({ text: `${cid} ${parts.join("; ")}`, clipId: cid });
  }
  return out;
}
