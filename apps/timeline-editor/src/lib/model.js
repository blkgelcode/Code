// The timeline model, shared by the server (validation, diffs, export) and the
// browser (editing). Pure functions only: no DOM, no Node APIs.
//
// All times are seconds. A media clip plays source seconds [in, out) starting at
// timeline position `start`; its length on the timeline is out - in.

export const SCHEMA_VERSION = 1;
export const TRACK_KINDS = ["video", "audio", "text"];
const EPS = 1e-6;

export const round = (n) => Math.round(n * 1000) / 1000;

export function defaultTimeline() {
  return {
    version: SCHEMA_VERSION,
    settings: { width: 1920, height: 1080, fps: 30, background: "#000000" },
    media: [],
    tracks: [
      { id: "t1", kind: "text", name: "Text 1", hidden: false, clips: [] },
      { id: "v1", kind: "video", name: "Video 1", hidden: false, muted: false, volume: 1, clips: [] },
      { id: "a1", kind: "audio", name: "Audio 1", muted: false, volume: 1, clips: [] },
    ],
  };
}

export const DEFAULT_TEXT_STYLE = {
  font: "Arial",
  size: 96,
  color: "#ffffff",
  x: 0.5,
  y: 0.85,
  align: "center",
  box: null,
};

// ---- basic queries -----------------------------------------------------------------------

export const isTextClip = (clip) => typeof clip.text === "string";
export const clipLength = (clip) => (isTextClip(clip) ? clip.duration : clip.out - clip.in);
export const clipEnd = (clip) => clip.start + clipLength(clip);

export function totalDuration(tl) {
  let end = 0;
  for (const t of tl.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return round(end);
}

export function findClip(tl, clipId) {
  for (const track of tl.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export const mediaById = (tl, id) => tl.media.find((m) => m.id === id);

/** Next unused id with this prefix: nextId(tl, "c") -> "c7". Looks at media, tracks and clips. */
export function nextId(tl, prefix) {
  let max = 0;
  const seen = (id) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id || "");
    if (m) max = Math.max(max, Number(m[1]));
  };
  tl.media.forEach((m) => seen(m.id));
  tl.tracks.forEach((t) => {
    seen(t.id);
    t.clips.forEach((c) => seen(c.id));
  });
  return `${prefix}${max + 1}`;
}

export const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- validation ----------------------------------------------------------------------------

const num = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Check a timeline and fill in defaults. Returns { timeline, errors, warnings }.
 * `timeline` is a normalized copy (never the input); errors mean it can't be used.
 */
export function normalize(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { timeline: null, errors: ["timeline.json must be a JSON object"], warnings };
  }
  const tl = clone(input);
  const d = defaultTimeline();
  tl.version ??= SCHEMA_VERSION;
  tl.settings = { ...d.settings, ...(tl.settings || {}) };
  for (const k of ["width", "height", "fps"]) {
    if (!num(tl.settings[k]) || tl.settings[k] <= 0) errors.push(`settings.${k} must be a positive number`);
  }
  if (!Array.isArray(tl.media)) {
    if (tl.media !== undefined) errors.push("media must be an array");
    tl.media = [];
  }
  if (!Array.isArray(tl.tracks)) {
    errors.push("tracks must be an array");
    return { timeline: null, errors, warnings };
  }

  const ids = new Set();
  const claim = (id, where) => {
    if (typeof id !== "string" || !id) errors.push(`${where}: missing "id"`);
    else if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    else ids.add(id);
  };

  tl.media.forEach((m, i) => {
    claim(m.id, `media[${i}]`);
    if (typeof m.file !== "string") errors.push(`media ${m.id}: "file" must be a string`);
    if (!["video", "audio", "image"].includes(m.kind)) errors.push(`media ${m.id}: kind must be video, audio or image`);
    if (m.kind !== "image" && !num(m.duration)) errors.push(`media ${m.id}: "duration" must be a number`);
    m.hasAudio ??= m.kind === "audio";
  });

  tl.tracks.forEach((t, ti) => {
    const where = `track ${t.id ?? `[${ti}]`}`;
    claim(t.id, where);
    if (!TRACK_KINDS.includes(t.kind)) errors.push(`${where}: kind must be video, audio or text`);
    t.name ??= t.id;
    t.hidden ??= false;
    t.muted ??= false;
    t.volume ??= 1;
    if (!Array.isArray(t.clips)) {
      errors.push(`${where}: "clips" must be an array`);
      t.clips = [];
    }
    t.clips.forEach((c, ci) => {
      const cw = `clip ${c.id ?? `${t.id}[${ci}]`}`;
      claim(c.id, cw);
      if (!num(c.start) || c.start < 0) errors.push(`${cw}: "start" must be a number >= 0`);
      c.fadeIn ??= 0;
      c.fadeOut ??= 0;
      if (t.kind === "text") {
        if (typeof c.text !== "string") errors.push(`${cw}: text clips need "text"`);
        if (!num(c.duration) || c.duration <= 0) errors.push(`${cw}: "duration" must be > 0`);
        c.style = { ...DEFAULT_TEXT_STYLE, ...(c.style || {}) };
      } else {
        const m = mediaById(tl, c.media);
        if (!m) {
          errors.push(`${cw}: media "${c.media}" is not in the media list`);
          return;
        }
        if (t.kind === "audio" && !(m.kind === "audio" || m.hasAudio)) errors.push(`${cw}: ${m.file} has no audio`);
        if (t.kind === "video" && m.kind === "audio") errors.push(`${cw}: audio file ${m.file} is on a video track`);
        c.in ??= 0;
        if (c.out === undefined && num(m.duration)) c.out = m.duration;
        if (!num(c.in) || !num(c.out) || c.in < 0 || c.out <= c.in + EPS) {
          errors.push(`${cw}: needs 0 <= in < out (got in=${c.in}, out=${c.out})`);
        } else if (m.kind !== "image" && c.out > m.duration + 0.05) {
          errors.push(`${cw}: out=${c.out} is past the end of ${m.file} (${m.duration}s)`);
        }
        c.volume ??= 1;
        if (t.kind === "video") c.fit ??= "cover";
      }
      if (num(c.fadeIn) && num(c.fadeOut) && c.fadeIn + c.fadeOut > clipLength(c) + EPS) {
        warnings.push(`${cw}: fades are longer than the clip`);
      }
    });
    const sorted = [...t.clips].filter((c) => num(c.start)).sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < clipEnd(sorted[i - 1]) - 0.001) {
        errors.push(`${where}: clips ${sorted[i - 1].id} and ${sorted[i].id} overlap (clips on one track can't overlap)`);
      }
    }
  });

  return { timeline: errors.length ? null : tl, errors, warnings };
}

// ---- edit operations (all return a new timeline) --------------------------------------------

function freeSpot(track, start, length, ignoreId) {
  const others = track.clips.filter((c) => c.id !== ignoreId);
  return !others.some((c) => start < clipEnd(c) - 0.001 && start + length > c.start + 0.001);
}

/** Move a clip to `start` on `trackId` (same kind). Returns null if it would overlap. */
export function moveClip(tl, clipId, start, trackId) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  const target = next.tracks.find((t) => t.id === (trackId || found.track.id));
  if (!target || target.kind !== found.track.kind) return null;
  const s = round(Math.max(0, start));
  if (!freeSpot(target, s, clipLength(found.clip), clipId)) return null;
  found.clip.start = s;
  if (target !== found.track) {
    found.track.clips = found.track.clips.filter((c) => c.id !== clipId);
    target.clips.push(found.clip);
  }
  target.clips.sort((a, b) => a.start - b.start);
  return next;
}

/**
 * Trim a clip edge to a timeline time. edge "start" moves the left edge (and `in`),
 * edge "end" moves the right edge (`out`, or `duration` for text).
 */
export function trimClip(tl, clipId, edge, time) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  const { clip, track } = found;
  const m = isTextClip(clip) ? null : mediaById(next, clip.media);
  const maxOut = m && m.kind !== "image" ? m.duration : Infinity;
  const minLen = 0.1;
  const others = track.clips.filter((c) => c.id !== clipId);
  if (edge === "start") {
    const prevEnd = Math.max(0, ...others.filter((c) => c.start < clip.start).map(clipEnd));
    const end = clipEnd(clip);
    let s = Math.min(Math.max(time, prevEnd), end - minLen);
    if (!isTextClip(clip)) s = Math.max(s, clip.start - clip.in); // can't go before source 0
    s = round(s);
    if (isTextClip(clip)) clip.duration = round(end - s);
    else clip.in = round(clip.in + (s - clip.start));
    clip.start = s;
  } else {
    const nextStart = Math.min(Infinity, ...others.filter((c) => c.start >= clip.start).map((c) => c.start));
    let e = Math.max(time, clip.start + minLen);
    e = Math.min(e, nextStart);
    if (isTextClip(clip)) clip.duration = round(e - clip.start);
    else clip.out = round(Math.min(clip.in + (e - clip.start), maxOut));
  }
  return next;
}

/** Split a clip at a timeline time into two clips. Returns null if the time isn't inside it. */
export function splitClip(tl, clipId, time) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  const { clip, track } = found;
  if (time <= clip.start + 0.05 || time >= clipEnd(clip) - 0.05) return null;
  const right = { ...clone(clip), id: nextId(next, "c"), start: round(time), fadeIn: 0 };
  clip.fadeOut = 0;
  if (isTextClip(clip)) {
    right.duration = round(clipEnd(clip) - time);
    clip.duration = round(time - clip.start);
  } else {
    const at = round(clip.in + (time - clip.start));
    right.in = at;
    clip.out = at;
  }
  track.clips.push(right);
  track.clips.sort((a, b) => a.start - b.start);
  return next;
}

export function deleteClip(tl, clipId) {
  const next = clone(tl);
  for (const t of next.tracks) t.clips = t.clips.filter((c) => c.id !== clipId);
  return next;
}

export function updateClip(tl, clipId, patch) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "style") found.clip.style = { ...found.clip.style, ...v };
    else found.clip[k] = v;
  }
  return next;
}

export function updateTrack(tl, trackId, patch) {
  const next = clone(tl);
  const t = next.tracks.find((x) => x.id === trackId);
  if (!t) return null;
  Object.assign(t, patch);
  return next;
}

export function addTrack(tl, kind) {
  const next = clone(tl);
  const prefix = { video: "v", audio: "a", text: "t" }[kind];
  const id = nextId(next, prefix);
  const n = next.tracks.filter((t) => t.kind === kind).length + 1;
  const name = `${kind[0].toUpperCase()}${kind.slice(1)} ${n}`;
  const track = kind === "text"
    ? { id, kind, name, hidden: false, clips: [] }
    : { id, kind, name, hidden: false, muted: false, volume: 1, clips: [] };
  // new text tracks go on top, new video tracks above the other video tracks, audio at the bottom
  const firstOfKind = next.tracks.findIndex((t) => t.kind === kind);
  if (kind === "audio") next.tracks.push(track);
  else if (firstOfKind >= 0) next.tracks.splice(firstOfKind, 0, track);
  else next.tracks.splice(kind === "text" ? 0 : next.tracks.findIndex((t) => t.kind === "audio") >>> 0, 0, track);
  return next;
}

export function deleteTrack(tl, trackId) {
  const next = clone(tl);
  next.tracks = next.tracks.filter((t) => t.id !== trackId);
  return next;
}

/** Place media on a track at `start`, or at the end of the track if start is null. */
export function addMediaClip(tl, mediaId, trackId, start = null) {
  const next = clone(tl);
  const m = mediaById(next, mediaId);
  if (!m) return null;
  const wantKind = m.kind === "audio" ? "audio" : "video";
  let track = next.tracks.find((t) => t.id === trackId);
  if (!track || track.kind !== wantKind) track = next.tracks.find((t) => t.kind === wantKind);
  if (!track) return null;
  const length = m.kind === "image" ? 5 : m.duration;
  let s = start ?? Math.max(0, ...track.clips.map(clipEnd));
  s = round(Math.max(0, s));
  if (!freeSpot(track, s, length)) s = round(Math.max(0, ...track.clips.map(clipEnd)));
  const clip = { id: nextId(next, "c"), media: mediaId, start: s, in: 0, out: round(length), volume: 1, fadeIn: 0, fadeOut: 0 };
  if (track.kind === "video") clip.fit = "cover";
  track.clips.push(clip);
  track.clips.sort((a, b) => a.start - b.start);
  return { timeline: next, clipId: clip.id };
}

export function addTextClip(tl, start, text = "Title", duration = 3) {
  let next = clone(tl);
  if (!next.tracks.some((t) => t.kind === "text")) next = addTrack(next, "text");
  const s = round(Math.max(0, start));
  let track = next.tracks.find((t) => t.kind === "text" && freeSpot(t, s, duration));
  if (!track) {
    next = addTrack(next, "text");
    track = next.tracks.find((t) => t.kind === "text" && t.clips.length === 0);
  }
  const clip = { id: nextId(next, "c"), start: s, duration, text, style: { ...DEFAULT_TEXT_STYLE }, fadeIn: 0.2, fadeOut: 0.2 };
  track.clips.push(clip);
  track.clips.sort((a, b) => a.start - b.start);
  return { timeline: next, clipId: clip.id };
}

// ---- diff: what changed, in words ------------------------------------------------------------

const fmt = (n) => `${round(n)}s`;
/** "/Volumes/T7/footage/day 2/a.mp4" -> "…/footage/day 2/a.mp4" */
export const shortPath = (p) => {
  const parts = String(p).split("/");
  return parts.length > 4 ? `…/${parts.slice(-3).join("/")}` : p;
};

function clipIndex(tl) {
  const map = new Map();
  for (const t of tl.tracks) for (const c of t.clips) map.set(c.id, { clip: c, track: t });
  return map;
}

/** Describe the differences between two timelines: [{ text, clipIds }] */
export function diffTimelines(prev, next) {
  const out = [];
  if (!prev) return [{ text: "Opened timeline", clipIds: [] }];
  const pm = new Map(prev.media.map((m) => [m.id, m]));
  for (const m of next.media) if (!pm.has(m.id)) out.push({ text: `Imported ${shortPath(m.file)} as ${m.id}`, clipIds: [] });
  const nm = new Map(next.media.map((m) => [m.id, m]));
  for (const m of prev.media) if (!nm.has(m.id)) out.push({ text: `Removed media ${m.id} (${shortPath(m.file)})`, clipIds: [] });
  for (const m of next.media) {
    const old = pm.get(m.id);
    if (old && old.file !== m.file) out.push({ text: `Relinked ${m.id} to ${m.file}`, clipIds: [] });
  }

  const pt = new Map(prev.tracks.map((t) => [t.id, t]));
  const nt = new Map(next.tracks.map((t) => [t.id, t]));
  for (const t of next.tracks) {
    const old = pt.get(t.id);
    if (!old) {
      out.push({ text: `Added track ${t.name} (${t.id})`, clipIds: [] });
      continue;
    }
    for (const k of ["name", "hidden", "muted", "volume"]) {
      if (old[k] !== t[k]) out.push({ text: `Track ${t.id}: ${k} ${JSON.stringify(old[k])} → ${JSON.stringify(t[k])}`, clipIds: [] });
    }
  }
  for (const t of prev.tracks) if (!nt.has(t.id)) out.push({ text: `Deleted track ${t.name} (${t.id})`, clipIds: [] });
  if (prev.tracks.map((t) => t.id).join() !== next.tracks.map((t) => t.id).join() && prev.tracks.length === next.tracks.length) {
    out.push({ text: "Reordered tracks", clipIds: [] });
  }

  const pc = clipIndex(prev);
  const nc = clipIndex(next);
  const label = (c) => (isTextClip(c) ? `text "${c.text.slice(0, 24)}"` : `${c.media}`);
  for (const [id, { clip, track }] of nc) {
    const old = pc.get(id);
    if (!old) {
      out.push({ text: `Added ${id} (${label(clip)}) on ${track.id} at ${fmt(clip.start)}`, clipIds: [id] });
      continue;
    }
    const o = old.clip;
    const parts = [];
    if (old.track.id !== track.id) parts.push(`moved to track ${track.id}`);
    if (o.start !== clip.start) parts.push(`start ${fmt(o.start)} → ${fmt(clip.start)}`);
    if (o.in !== clip.in || o.out !== clip.out) {
      if (!isTextClip(clip)) parts.push(`trimmed to source ${fmt(clip.in)}–${fmt(clip.out)} (was ${fmt(o.in)}–${fmt(o.out)})`);
    }
    if (o.duration !== clip.duration && isTextClip(clip)) parts.push(`duration ${fmt(o.duration)} → ${fmt(clip.duration)}`);
    if (o.text !== clip.text) parts.push(`text → "${clip.text}"`);
    for (const k of ["volume", "fadeIn", "fadeOut", "fit", "media"]) {
      if (o[k] !== clip[k]) parts.push(`${k} ${JSON.stringify(o[k])} → ${JSON.stringify(clip[k])}`);
    }
    if (JSON.stringify(o.style) !== JSON.stringify(clip.style)) parts.push("style changed");
    if (parts.length) out.push({ text: `${id}: ${parts.join(", ")}`, clipIds: [id] });
  }
  for (const [id, { clip }] of pc) if (!nc.has(id)) out.push({ text: `Deleted ${id} (${label(clip)})`, clipIds: [] });

  if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) {
    const s = next.settings;
    out.push({ text: `Settings: ${s.width}×${s.height} @ ${s.fps}fps, background ${s.background}`, clipIds: [] });
  }
  return out;
}
