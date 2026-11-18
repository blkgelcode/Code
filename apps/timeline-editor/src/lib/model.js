// The timeline model (schema v2), shared by the server (validation, history,
// export), the `tl` CLI and the browser (editing). Pure functions: no DOM, no Node.
//
// All times are seconds. A media clip plays source seconds [in, out) starting at
// timeline position `start`; its length on the timeline is out - in.
//
// v2: the edit lives in `sequences` (one is `mainSequence`). A video clip's sound
// is its own clip on an audio track, tied to the picture by a shared `link` id,
// which is what makes J and L cuts possible. Edit operations act on linked
// partners too, unless called with { linked: false } (Option/Alt in the UI).

export const SCHEMA_VERSION = 2;
export const TRACK_KINDS = ["video", "audio", "text"];
export const CHANNELS = ["@blkgrlco", "@blkgrlcotakesoff", "podcast"];
const EPS = 1e-6;

export const round = (n) => Math.round(n * 1000) / 1000;
export const clone = (x) => JSON.parse(JSON.stringify(x));

export function defaultTimeline() {
  return {
    version: SCHEMA_VERSION,
    project: { name: "Untitled", channel: null, look: "channel" },
    media: [],
    sequences: [{
      id: "s1",
      name: "Main",
      settings: { width: 1920, height: 1080, fps: 30, background: "#000000" },
      tracks: [
        { id: "t1", kind: "text", name: "Text 1", hidden: false, clips: [] },
        { id: "v1", kind: "video", name: "Video 1", hidden: false, clips: [] },
        { id: "a1", kind: "audio", name: "Audio 1", muted: false, volume: 1, clips: [] },
      ],
      markers: [],
    }],
    mainSequence: "s1",
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

/** The sequence being edited (the main one unless an id is given). */
export function seqOf(tl, id) {
  const want = id || tl.mainSequence;
  return tl.sequences.find((s) => s.id === want) || tl.sequences[0];
}

export const isTextClip = (clip) => typeof clip.text === "string";
export const clipLength = (clip) => (isTextClip(clip) ? clip.duration : clip.out - clip.in);
export const clipEnd = (clip) => clip.start + clipLength(clip);

export function totalDuration(tl) {
  let end = 0;
  for (const t of seqOf(tl).tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return round(end);
}

export function findClip(tl, clipId) {
  for (const seq of tl.sequences) {
    for (const track of seq.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip, seq };
    }
  }
  return null;
}

export const mediaById = (tl, id) => tl.media.find((m) => m.id === id);

/** Clips tied to this one by `link` (not including itself). */
export function linkedPartners(tl, clipId) {
  const f = findClip(tl, clipId);
  if (!f?.clip.link) return [];
  const out = [];
  for (const t of f.seq.tracks) for (const c of t.clips) if (c.link === f.clip.link && c.id !== clipId) out.push({ clip: c, track: t });
  return out;
}

/** Next unused id with this prefix: nextId(tl, "c") -> "c7". Looks at everything with an id. */
export function nextId(tl, prefix) {
  let max = 0;
  const seen = (id) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id || "");
    if (m) max = Math.max(max, Number(m[1]));
  };
  tl.media.forEach((m) => seen(m.id));
  for (const s of tl.sequences) {
    seen(s.id);
    for (const t of s.tracks) {
      seen(t.id);
      t.clips.forEach((c) => {
        seen(c.id);
        seen(c.link);
      });
    }
  }
  return `${prefix}${max + 1}`;
}

// ---- migration from v1 ----------------------------------------------------------------------

/**
 * v1 -> v2. Settings and tracks move into one sequence. Each v1 video clip that
 * played sound gets a linked audio clip, on the first audio track with room
 * (a new "Camera audio" track if none has), carrying its volume.
 */
export function migrate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  if (input.version === 2 || Array.isArray(input.sequences)) return input;
  if (!Array.isArray(input.tracks)) return input;
  const v1 = clone(input);
  const media = Array.isArray(v1.media) ? v1.media : [];
  const tracks = v1.tracks.map((t) => ({ ...t, clips: Array.isArray(t.clips) ? t.clips : [] }));
  const audioTracks = tracks.filter((t) => t.kind === "audio");
  let linkN = 0;
  const newAudio = [];
  for (const t of tracks.filter((x) => x.kind === "video")) {
    const trackVol = t.volume ?? 1;
    for (const c of t.clips) {
      const m = media.find((x) => x.id === c.media);
      const vol = (c.volume ?? 1) * trackVol;
      if (m?.hasAudio && m.kind === "video" && !t.muted && vol > 0) {
        const a = { id: `${c.id}a`, media: c.media, start: c.start, in: c.in ?? 0, out: c.out ?? m.duration, volume: round(vol), fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0 };
        const link = `L${++linkN}`;
        c.link = link;
        a.link = link;
        const free = (tr) => !tr.clips.some((x) => a.start < clipEnd(x) - 0.001 && clipEnd(a) > x.start + 0.001);
        let target = [...newAudio, ...audioTracks].find(free);
        if (!target) {
          target = { id: `a_cam${newAudio.length + 1}`, kind: "audio", name: newAudio.length ? `Camera audio ${newAudio.length + 1}` : "Camera audio", muted: false, volume: 1, clips: [] };
          newAudio.push(target);
        }
        target.clips.push(a);
      }
      delete c.volume;
    }
    delete t.muted;
    delete t.volume;
  }
  // camera audio tracks go right after the video tracks, above music/voice tracks
  const firstAudio = tracks.findIndex((t) => t.kind === "audio");
  tracks.splice(firstAudio < 0 ? tracks.length : firstAudio, 0, ...newAudio);
  for (const t of tracks) t.clips.sort((a, b) => a.start - b.start);
  return {
    version: 2,
    project: { name: "Untitled", channel: null, look: "channel" },
    media,
    sequences: [{ id: "s1", name: "Main", settings: v1.settings || defaultTimeline().sequences[0].settings, tracks, markers: [] }],
    mainSequence: "s1",
  };
}

// ---- validation ----------------------------------------------------------------------------

const num = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Check a timeline and fill in defaults. Returns { timeline, errors, warnings, migrated }.
 * `timeline` is a normalized copy (never the input); errors mean it can't be used.
 * A v1 file is migrated to v2 first.
 */
export function normalize(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { timeline: null, errors: ["timeline.json must be a JSON object"], warnings };
  }
  const migrated = input.version !== 2 && Array.isArray(input.tracks);
  const tl = clone(migrate(input));
  if (!Array.isArray(tl.sequences) || !tl.sequences.length) {
    return { timeline: null, errors: ['"sequences" must be a non-empty array'], warnings };
  }
  tl.version = SCHEMA_VERSION;
  tl.project = { name: "Untitled", channel: null, look: "channel", ...(tl.project || {}) };
  if (tl.project.channel !== null && !CHANNELS.includes(tl.project.channel)) {
    errors.push(`project.channel must be null or one of ${CHANNELS.join(", ")}`);
  }
  if (!Array.isArray(tl.media)) {
    if (tl.media !== undefined) errors.push("media must be an array");
    tl.media = [];
  }
  tl.mainSequence ??= tl.sequences[0].id;

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
    if (m.logProfile !== undefined && !["dlogm", "none"].includes(m.logProfile)) errors.push(`media ${m.id}: logProfile must be "dlogm" or "none"`);
  });

  for (const seq of tl.sequences) {
    claim(seq.id, `sequence ${seq.id ?? "?"}`);
    seq.name ??= seq.id;
    seq.settings = { ...defaultTimeline().sequences[0].settings, ...(seq.settings || {}) };
    for (const k of ["width", "height", "fps"]) {
      if (!num(seq.settings[k]) || seq.settings[k] <= 0) errors.push(`sequence ${seq.id}: settings.${k} must be a positive number`);
    }
    seq.markers ??= [];
    if (!Array.isArray(seq.tracks)) {
      errors.push(`sequence ${seq.id}: tracks must be an array`);
      seq.tracks = [];
    }
    const links = new Map();
    seq.tracks.forEach((t, ti) => {
      const where = `track ${t.id ?? `[${ti}]`}`;
      claim(t.id, where);
      if (!TRACK_KINDS.includes(t.kind)) errors.push(`${where}: kind must be video, audio or text`);
      t.name ??= t.id;
      if (t.kind !== "audio") t.hidden ??= false;
      if (t.kind === "audio") {
        t.muted ??= false;
        t.volume ??= 1;
      }
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
        if (c.link) links.set(c.link, (links.get(c.link) || 0) + 1);
        if (t.kind === "text") {
          if (typeof c.text !== "string") errors.push(`${cw}: text clips need "text"`);
          if (!num(c.duration) || c.duration <= 0) errors.push(`${cw}: "duration" must be > 0`);
          c.style = { ...DEFAULT_TEXT_STYLE, ...(c.style || {}) };
          return;
        }
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
        if (t.kind === "audio") c.volume ??= 1;
        if (t.kind === "video") {
          c.fit ??= "cover";
          c.color = { input: "auto", look: "project", ...(c.color || {}) };
          if (c.volume !== undefined) warnings.push(`${cw}: "volume" does nothing on a video clip in v2; its sound is a linked audio clip`);
        }
      });
      const sorted = [...t.clips].filter((c) => num(c.start)).sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < clipEnd(sorted[i - 1]) - 0.001) {
          errors.push(`${where}: clips ${sorted[i - 1].id} and ${sorted[i].id} overlap (clips on one track can't overlap)`);
        }
      }
      for (const c of t.clips) {
        if (num(c.fadeIn) && num(c.fadeOut) && num(c.start) && c.fadeIn + c.fadeOut > clipLength(c) + EPS) warnings.push(`clip ${c.id}: fades are longer than the clip`);
      }
    });
    for (const [link, n] of links) if (n < 2) warnings.push(`link ${link} has only one clip`);
  }
  if (!tl.sequences.some((s) => s.id === tl.mainSequence)) errors.push(`mainSequence "${tl.mainSequence}" doesn't exist`);

  return { timeline: errors.length ? null : tl, errors, warnings, migrated };
}

// ---- edit operations (all return a new timeline, or null if not possible) --------------------

function freeSpot(track, start, length, ignoreIds = []) {
  const others = track.clips.filter((c) => !ignoreIds.includes(c.id));
  return !others.some((c) => start < clipEnd(c) - 0.001 && start + length > c.start + 0.001);
}

const sortTrack = (t) => t.clips.sort((a, b) => a.start - b.start);
const group = (tl, clipId, linked) => [findClip(tl, clipId), ...(linked ? linkedPartners(tl, clipId) : [])].filter(Boolean);

/**
 * Move a clip to `start` (optionally onto `trackId`, same kind). Linked partners
 * move by the same amount on their own tracks. Null if anything would overlap.
 */
export function moveClip(tl, clipId, start, trackId, { linked = true } = {}) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  const target = found.seq.tracks.find((t) => t.id === (trackId || found.track.id));
  if (!target || target.kind !== found.track.kind) return null;
  const delta = round(Math.max(0, start)) - found.clip.start;
  const members = group(next, clipId, linked);
  const movingIds = members.map((x) => x.clip.id);
  if (members.some((x) => x.clip.start + delta < -EPS)) return null;
  for (const x of members) {
    const dest = x.clip.id === clipId ? target : x.track;
    if (!freeSpot(dest, round(x.clip.start + delta), clipLength(x.clip), movingIds)) return null;
  }
  for (const x of members) {
    x.clip.start = round(x.clip.start + delta);
    if (x.clip.id === clipId && target !== found.track) {
      found.track.clips = found.track.clips.filter((c) => c.id !== clipId);
      target.clips.push(x.clip);
    }
  }
  found.seq.tracks.forEach(sortTrack);
  return next;
}

function trimOne(next, clip, track, edge, time) {
  const m = isTextClip(clip) ? null : mediaById(next, clip.media);
  const maxOut = m && m.kind !== "image" ? m.duration : Infinity;
  const minLen = 0.1;
  const others = track.clips.filter((c) => c.id !== clip.id);
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
}

/**
 * Trim a clip edge to a timeline time. edge "start" moves the left edge (and `in`),
 * edge "end" moves the right edge (`out`, or `duration` for text). Linked partners
 * have the same edge moved by the same amount (so a J/L offset is kept).
 */
export function trimClip(tl, clipId, edge, time, { linked = true } = {}) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  const edgeTime = (c) => (edge === "start" ? c.start : clipEnd(c));
  const delta = time - edgeTime(found.clip);
  trimOne(next, found.clip, found.track, edge, time);
  const actual = edgeTime(found.clip) - (time - delta);
  if (linked) for (const p of linkedPartners(next, clipId)) trimOne(next, p.clip, p.track, edge, edgeTime(p.clip) + actual);
  return next;
}

/** Split a clip (and its linked partners that span the time) at a timeline time. */
export function splitClip(tl, clipId, time, { linked = true } = {}) {
  let next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  if (time <= found.clip.start + 0.05 || time >= clipEnd(found.clip) - 0.05) return null;
  const members = group(next, clipId, linked).filter((x) => time > x.clip.start + 0.05 && time < clipEnd(x.clip) - 0.05);
  const newLink = members.length > 1 ? nextId(next, "L") : null;
  let firstRight = null;
  for (const { clip, track } of members) {
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
    if (newLink) right.link = newLink;
    else delete right.link;
    track.clips.push(right);
    sortTrack(track);
    firstRight ??= right.id;
  }
  return next;
}

/** Delete a clip and (unless linked: false) its linked partners. ripple: close the gap on its track. */
export function deleteClip(tl, clipId, { linked = true, ripple = false } = {}) {
  const next = clone(tl);
  const members = group(next, clipId, linked);
  if (!members.length) return null;
  const { seq } = findClip(next, clipId);
  const link = members[0].clip.link;
  for (const { clip, track } of members) {
    track.clips = track.clips.filter((c) => c.id !== clip.id);
    if (ripple) {
      const len = clipLength(clip);
      for (const c of track.clips) if (c.start >= clipEnd(clip) - 0.001) c.start = round(c.start - len);
    }
  }
  if (link) {
    // a partner left on its own drops the link
    const left = seq.tracks.flatMap((t) => t.clips.filter((c) => c.link === link));
    if (left.length === 1) delete left[0].link;
  }
  return next;
}

/** Remove the link between a clip and its partners. */
export function unlinkClip(tl, clipId) {
  const next = clone(tl);
  const f = findClip(next, clipId);
  if (!f?.clip.link) return null;
  const link = f.clip.link;
  for (const t of f.seq.tracks) for (const c of t.clips) if (c.link === link) delete c.link;
  return next;
}

export function updateClip(tl, clipId, patch) {
  const next = clone(tl);
  const found = findClip(next, clipId);
  if (!found) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "style" || k === "color") found.clip[k] = { ...(found.clip[k] || {}), ...v };
    else if (v === undefined) delete found.clip[k];
    else found.clip[k] = v;
  }
  return next;
}

export function updateMedia(tl, mediaId, patch) {
  const next = clone(tl);
  const m = mediaById(next, mediaId);
  if (!m) return null;
  Object.assign(m, patch);
  return next;
}

export function updateProject(tl, patch) {
  const next = clone(tl);
  next.project = { ...next.project, ...patch };
  return next;
}

export function updateSettings(tl, patch) {
  const next = clone(tl);
  const s = seqOf(next);
  s.settings = { ...s.settings, ...patch };
  return next;
}

export function updateTrack(tl, trackId, patch) {
  const next = clone(tl);
  const t = seqOf(next).tracks.find((x) => x.id === trackId);
  if (!t) return null;
  Object.assign(t, patch);
  return next;
}

export function addTrack(tl, kind, { name } = {}) {
  const next = clone(tl);
  const seq = seqOf(next);
  const prefix = { video: "v", audio: "a", text: "t" }[kind];
  const id = nextId(next, prefix);
  const n = seq.tracks.filter((t) => t.kind === kind).length + 1;
  const track = kind === "audio"
    ? { id, kind, name: name || `Audio ${n}`, muted: false, volume: 1, clips: [] }
    : { id, kind, name: name || `${kind === "text" ? "Text" : "Video"} ${n}`, hidden: false, clips: [] };
  // text on top, new video above the other video tracks, audio at the bottom
  const firstOfKind = seq.tracks.findIndex((t) => t.kind === kind);
  if (kind === "audio") seq.tracks.push(track);
  else if (firstOfKind >= 0) seq.tracks.splice(firstOfKind, 0, track);
  else if (kind === "text") seq.tracks.unshift(track);
  else {
    const firstAudio = seq.tracks.findIndex((t) => t.kind === "audio");
    seq.tracks.splice(firstAudio < 0 ? seq.tracks.length : firstAudio, 0, track);
  }
  return next;
}

export function deleteTrack(tl, trackId) {
  const next = clone(tl);
  const seq = seqOf(next);
  seq.tracks = seq.tracks.filter((t) => t.id !== trackId);
  return next;
}

/**
 * Place media at `start` (or the end of the track if null). A video with sound
 * becomes a picture clip and a linked sound clip. Dropping a video on an audio
 * track places only its sound.
 */
export function addMediaClip(tl, mediaId, trackId, start = null) {
  let next = clone(tl);
  const m = mediaById(next, mediaId);
  if (!m) return null;
  const seq = () => seqOf(next);
  const length = round(m.kind === "image" ? 5 : m.duration);
  const asked = seq().tracks.find((t) => t.id === trackId);
  const soundOnly = m.kind === "audio" || (asked?.kind === "audio" && m.hasAudio);
  const wantVideo = !soundOnly;
  const wantAudio = soundOnly || (m.kind === "video" && m.hasAudio);

  let vTrack = wantVideo ? (asked?.kind === "video" ? asked : seq().tracks.find((t) => t.kind === "video")) : null;
  if (wantVideo && !vTrack) {
    next = addTrack(next, "video");
    vTrack = seq().tracks.find((t) => t.kind === "video");
  }
  const endOf = (t) => Math.max(0, ...t.clips.map(clipEnd));
  let s = start ?? (vTrack ? endOf(vTrack) : asked?.kind === "audio" ? endOf(asked) : 0);
  s = round(Math.max(0, s));
  if (vTrack && !freeSpot(vTrack, s, length)) s = round(endOf(vTrack));

  let aTrack = null;
  if (wantAudio) {
    const candidates = [asked?.kind === "audio" ? asked : null, ...seq().tracks.filter((t) => t.kind === "audio")].filter(Boolean);
    aTrack = candidates.find((t) => freeSpot(t, s, length));
    if (!aTrack) {
      if (soundOnly && start === null && candidates[0]) {
        aTrack = candidates[0];
        s = round(endOf(aTrack));
      } else {
        next = addTrack(next, "audio");
        aTrack = seq().tracks[seq().tracks.length - 1];
      }
    }
  }
  const base = { media: mediaId, start: s, in: 0, out: length, fadeIn: 0, fadeOut: 0 };
  const ids = [];
  const link = wantVideo && wantAudio ? nextId(next, "L") : null;
  if (wantVideo) {
    const c = { id: nextId(next, "c"), ...base, fit: "cover" };
    if (link) c.link = link;
    vTrack.clips.push(c);
    sortTrack(vTrack);
    ids.push(c.id);
  }
  if (wantAudio) {
    const c = { id: nextId(next, "c"), ...base, volume: 1 };
    if (link) c.link = link;
    aTrack.clips.push(c);
    sortTrack(aTrack);
    ids.push(c.id);
  }
  return { timeline: next, clipId: ids[0], clipIds: ids };
}

export function addTextClip(tl, start, text = "Title", duration = 3) {
  let next = clone(tl);
  if (!seqOf(next).tracks.some((t) => t.kind === "text")) next = addTrack(next, "text");
  const s = round(Math.max(0, start));
  let track = seqOf(next).tracks.find((t) => t.kind === "text" && freeSpot(t, s, duration));
  if (!track) {
    next = addTrack(next, "text");
    track = seqOf(next).tracks.find((t) => t.kind === "text" && t.clips.length === 0);
  }
  const clip = { id: nextId(next, "c"), start: s, duration, text, style: { ...DEFAULT_TEXT_STYLE }, fadeIn: 0.2, fadeOut: 0.2 };
  track.clips.push(clip);
  sortTrack(track);
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
  for (const s of tl.sequences || []) for (const t of s.tracks) for (const c of t.clips) map.set(c.id, { clip: c, track: t });
  return map;
}

/** Describe the differences between two timelines: [{ text, clipIds }] */
export function diffTimelines(prev, next) {
  const out = [];
  if (!prev) return [{ text: "Opened timeline", clipIds: [] }];
  if (prev.version !== next.version) out.push({ text: `Upgraded the project to schema v${next.version}`, clipIds: [] });
  const pm = new Map((prev.media || []).map((m) => [m.id, m]));
  for (const m of next.media) if (!pm.has(m.id)) out.push({ text: `Imported ${shortPath(m.file)} as ${m.id}`, clipIds: [] });
  const nm = new Map(next.media.map((m) => [m.id, m]));
  for (const m of prev.media || []) if (!nm.has(m.id)) out.push({ text: `Removed media ${m.id} (${shortPath(m.file)})`, clipIds: [] });
  for (const m of next.media) {
    const old = pm.get(m.id);
    if (!old) continue;
    if (old.file !== m.file) out.push({ text: `Relinked ${m.id} to ${m.file}`, clipIds: [] });
    if ((old.logProfile || "none") !== (m.logProfile || "none")) {
      out.push({ text: `${m.id}: ${m.logProfile === "dlogm" ? "D-Log M → Rec.709 conversion on" : "D-Log M conversion off"}`, clipIds: [] });
    }
  }
  if (JSON.stringify(prev.project) !== JSON.stringify(next.project) && prev.project) {
    const p = next.project;
    out.push({ text: `Project: ${p.name}, channel ${p.channel || "none"}, look ${p.look}`, clipIds: [] });
  }
  if (!prev.sequences) return out;

  const ps = seqOf(prev);
  const ns = seqOf(next);
  const pt = new Map(ps.tracks.map((t) => [t.id, t]));
  const nt = new Map(ns.tracks.map((t) => [t.id, t]));
  for (const t of ns.tracks) {
    const old = pt.get(t.id);
    if (!old) {
      out.push({ text: `Added track ${t.name} (${t.id})`, clipIds: [] });
      continue;
    }
    for (const k of ["name", "hidden", "muted", "volume"]) {
      if (old[k] !== t[k]) out.push({ text: `Track ${t.id}: ${k} ${JSON.stringify(old[k])} → ${JSON.stringify(t[k])}`, clipIds: [] });
    }
  }
  for (const t of ps.tracks) if (!nt.has(t.id)) out.push({ text: `Deleted track ${t.name} (${t.id})`, clipIds: [] });
  if (ps.tracks.map((t) => t.id).join() !== ns.tracks.map((t) => t.id).join() && ps.tracks.length === ns.tracks.length) {
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
    if ((o.in !== clip.in || o.out !== clip.out) && !isTextClip(clip)) parts.push(`trimmed to source ${fmt(clip.in)}–${fmt(clip.out)} (was ${fmt(o.in)}–${fmt(o.out)})`);
    if (o.duration !== clip.duration && isTextClip(clip)) parts.push(`duration ${fmt(o.duration)} → ${fmt(clip.duration)}`);
    if (o.text !== clip.text) parts.push(`text → "${clip.text}"`);
    for (const k of ["volume", "fadeIn", "fadeOut", "fit", "media", "link"]) {
      if (o[k] !== clip[k]) parts.push(k === "link" ? (clip.link ? `linked (${clip.link})` : "unlinked") : `${k} ${JSON.stringify(o[k])} → ${JSON.stringify(clip[k])}`);
    }
    if (JSON.stringify(o.style) !== JSON.stringify(clip.style)) parts.push("style changed");
    if (JSON.stringify(o.color) !== JSON.stringify(clip.color)) parts.push(`color ${JSON.stringify(clip.color)}`);
    if (parts.length) out.push({ text: `${id}: ${parts.join(", ")}`, clipIds: [id] });
  }
  for (const [id, { clip }] of pc) if (!nc.has(id)) out.push({ text: `Deleted ${id} (${label(clip)})`, clipIds: [] });

  if (JSON.stringify(ps.settings) !== JSON.stringify(ns.settings)) {
    const s = ns.settings;
    out.push({ text: `Settings: ${s.width}×${s.height} @ ${s.fps}fps, background ${s.background}`, clipIds: [] });
  }
  if (JSON.stringify(ps.markers) !== JSON.stringify(ns.markers)) out.push({ text: "Markers changed", clipIds: [] });
  return out;
}
