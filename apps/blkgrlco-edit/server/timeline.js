// timeline.json: defaults, validation, and change descriptions for the activity log.
// Pure functions only (no I/O) so they're easy to test.

export const SCHEMA_VERSION = 1;
const ROUND = 1000; // keep times to the millisecond

export const r3 = (n) => Math.round(n * ROUND) / ROUND;

export function emptyTimeline(name = "Untitled") {
  return {
    version: SCHEMA_VERSION,
    project: { name, width: 1080, height: 1920, fps: 30, background: "#000000" },
    media: [],
    tracks: [
      { id: "v1", kind: "video", name: "Video 1", muted: false, hidden: false, clips: [] },
      { id: "a1", kind: "audio", name: "Audio 1", muted: false, hidden: false, clips: [] },
      { id: "t1", kind: "text", name: "Text 1", muted: false, hidden: false, clips: [] },
    ],
    nextId: 1,
  };
}

export const DEFAULT_TEXT_STYLE = {
  font: "default", size: 96, color: "#FFFFFF", x: 0.5, y: 0.5, align: "center", bold: true,
};

/** Length of a clip on the timeline, in seconds. */
export function clipDuration(clip) {
  if (clip.text !== undefined) return clip.duration;
  return clip.out - clip.in;
}
export const clipEnd = (clip) => clip.start + clipDuration(clip);

/** Total timeline length: the end of the last clip on any track. */
export function timelineDuration(tl) {
  let end = 0;
  for (const t of tl.tracks || []) for (const c of t.clips || []) end = Math.max(end, clipEnd(c));
  return r3(end);
}

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

/**
 * Validate a parsed timeline. Returns { errors, warnings }.
 * Errors make the file unusable (the app keeps the last good version);
 * warnings are shown but the file is accepted.
 */
export function validate(tl) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!tl || typeof tl !== "object" || Array.isArray(tl)) return { errors: ["timeline must be a JSON object"], warnings };
  if (tl.version !== SCHEMA_VERSION) err(`version must be ${SCHEMA_VERSION}`);
  const p = tl.project || {};
  for (const k of ["width", "height", "fps"]) if (!isNum(p[k]) || p[k] <= 0) err(`project.${k} must be a positive number`);
  if (!Array.isArray(tl.media)) err("media must be an array");
  if (!Array.isArray(tl.tracks)) err("tracks must be an array");
  if (errors.length) return { errors, warnings };

  const media = new Map();
  for (const m of tl.media) {
    if (!m.id || !m.file) { err(`media entry needs id and file: ${JSON.stringify(m)}`); continue; }
    if (media.has(m.id)) err(`duplicate media id ${m.id}`);
    media.set(m.id, m);
  }
  const ids = new Set();
  const trackIds = new Set();
  for (const t of tl.tracks) {
    if (!t.id) { err("every track needs an id"); continue; }
    if (trackIds.has(t.id)) err(`duplicate track id ${t.id}`);
    trackIds.add(t.id);
    if (!["video", "audio", "text"].includes(t.kind)) err(`track ${t.id}: kind must be video, audio or text`);
    if (!Array.isArray(t.clips)) { err(`track ${t.id}: clips must be an array`); continue; }
    for (const c of t.clips) {
      const where = `clip ${c.id || "?"} on ${t.id}`;
      if (!c.id) err(`${where}: missing id`);
      else if (ids.has(c.id)) err(`duplicate clip id ${c.id}`);
      ids.add(c.id);
      if (!isNum(c.start) || c.start < 0) err(`${where}: start must be a number ≥ 0`);
      if (t.kind === "text") {
        if (typeof c.text !== "string") err(`${where}: text clips need a "text" string`);
        if (!isNum(c.duration) || c.duration <= 0) err(`${where}: duration must be > 0`);
        continue;
      }
      if (c.text !== undefined) err(`${where}: text clips belong on a text track`);
      const m = media.get(c.media);
      if (!m) { err(`${where}: media "${c.media}" isn't in the media list`); continue; }
      if (!isNum(c.in) || !isNum(c.out)) { err(`${where}: in and out must be numbers`); continue; }
      if (c.in < 0) err(`${where}: in must be ≥ 0`);
      if (c.out <= c.in) err(`${where}: out (${c.out}) must be after in (${c.in})`);
      if (m.type !== "image" && isNum(m.duration) && c.out > m.duration + 0.05)
        err(`${where}: out (${c.out}) is past the end of ${m.file} (${m.duration}s)`);
      if (t.kind === "video" && m.type === "audio") err(`${where}: ${m.file} is audio; put it on an audio track`);
      if (t.kind === "audio" && m.type === "image") err(`${where}: ${m.file} is an image; put it on a video track`);
      if (c.volume !== undefined && (!isNum(c.volume) || c.volume < 0 || c.volume > 4)) err(`${where}: volume must be 0–4`);
      if (c.fit !== undefined && !["cover", "contain"].includes(c.fit)) err(`${where}: fit must be cover or contain`);
    }
    const sorted = [...t.clips].filter((c) => isNum(c.start)).sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (clipEnd(prev) > sorted[i].start + 0.001)
        warn(`${prev.id} and ${sorted[i].id} overlap on ${t.id} (${r3(clipEnd(prev))}s > ${sorted[i].start}s)`);
    }
  }
  if (isNum(tl.nextId)) {
    for (const id of ids) {
      const n = Number(/^c(\d+)$/.exec(id)?.[1]);
      if (n >= tl.nextId) warn(`nextId (${tl.nextId}) should be greater than ${id}; it will be bumped`);
    }
  }
  return { errors, warnings };
}

/** Fill defaults and fix up nextId. Doesn't change anything the author set. */
export function normalize(tl) {
  const out = structuredClone(tl);
  out.project = { background: "#000000", name: "Untitled", ...out.project };
  let maxN = 0;
  for (const t of out.tracks) {
    t.muted = !!t.muted;
    t.hidden = !!t.hidden;
    t.name = t.name || t.id;
    for (const c of t.clips) {
      const n = Number(/^c(\d+)$/.exec(c.id)?.[1]);
      if (n > maxN) maxN = n;
      if (t.kind === "text") c.style = { ...DEFAULT_TEXT_STYLE, ...(c.style || {}) };
    }
  }
  out.nextId = Math.max(out.nextId || 1, maxN + 1);
  return out;
}

export function nextClipId(tl) {
  const id = `c${tl.nextId || 1}`;
  tl.nextId = (tl.nextId || 1) + 1;
  return id;
}

// ---------------------------------------------------------------- diffing

const fmtT = (s) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
};

function index(tl) {
  const clips = new Map();
  const tracks = new Map();
  for (const t of tl?.tracks || []) {
    tracks.set(t.id, t);
    for (const c of t.clips || []) clips.set(c.id, { clip: c, track: t });
  }
  return { clips, tracks };
}

function describeClip(c, tl) {
  if (c.text !== undefined) return `"${c.text.slice(0, 30)}"`;
  const m = (tl.media || []).find((x) => x.id === c.media);
  return m ? m.file : c.media;
}

/**
 * Human-readable list of what changed between two timelines.
 * Each entry: { clipId?, trackId?, kind, text }.
 */
export function diffTimelines(a, b) {
  const changes = [];
  if (!a) return [{ kind: "load", text: "timeline loaded" }];
  const A = index(a);
  const B = index(b);
  const add = (kind, text, extra = {}) => changes.push({ kind, text, ...extra });

  for (const [id, { clip, track }] of B.clips) {
    if (!A.clips.has(id)) add("add", `added ${id} (${describeClip(clip, b)}) on ${track.name} at ${fmtT(clip.start)}`, { clipId: id, trackId: track.id });
  }
  for (const [id, { clip, track }] of A.clips) {
    if (!B.clips.has(id)) add("delete", `deleted ${id} (${describeClip(clip, a)}) from ${track.name}`, { clipId: id, trackId: track.id });
  }
  for (const [id, { clip: nb, track: tb }] of B.clips) {
    const old = A.clips.get(id);
    if (!old) continue;
    const oa = old.clip;
    const base = { clipId: id, trackId: tb.id };
    if (old.track.id !== tb.id) add("move", `moved ${id} from ${old.track.name} to ${tb.name}`, base);
    if (oa.start !== nb.start && oa.in === nb.in) add("move", `moved ${id} ${fmtT(oa.start)} → ${fmtT(nb.start)}`, base);
    if (oa.in !== nb.in || oa.out !== nb.out) {
      const parts = [];
      if (oa.in !== nb.in) parts.push(`in ${r3(oa.in)}s → ${r3(nb.in)}s`);
      if (oa.out !== nb.out) parts.push(`out ${r3(oa.out)}s → ${r3(nb.out)}s`);
      add("trim", `trimmed ${id}: ${parts.join(", ")}`, base);
    }
    if (oa.duration !== nb.duration && nb.text !== undefined) add("trim", `${id} length ${r3(oa.duration)}s → ${r3(nb.duration)}s`, base);
    if (oa.text !== nb.text && nb.text !== undefined) add("text", `${id} text → "${nb.text.slice(0, 40)}"`, base);
    if (JSON.stringify(oa.style) !== JSON.stringify(nb.style) && nb.style) add("style", `${id} style changed`, base);
    if ((oa.volume ?? 1) !== (nb.volume ?? 1)) add("volume", `${id} volume ${oa.volume ?? 1} → ${nb.volume ?? 1}`, base);
    if ((oa.fadeIn || 0) !== (nb.fadeIn || 0) || (oa.fadeOut || 0) !== (nb.fadeOut || 0))
      add("fade", `${id} fades in ${nb.fadeIn || 0}s / out ${nb.fadeOut || 0}s`, base);
    if ((oa.fit || "cover") !== (nb.fit || "cover")) add("style", `${id} fit → ${nb.fit}`, base);
  }
  for (const [id, t] of B.tracks) {
    const o = A.tracks.get(id);
    if (!o) { add("track", `added track ${t.name}`, { trackId: id }); continue; }
    if (o.muted !== t.muted) add("track", `${t.name} ${t.muted ? "muted" : "unmuted"}`, { trackId: id });
    if (o.hidden !== t.hidden) add("track", `${t.name} ${t.hidden ? "hidden" : "shown"}`, { trackId: id });
    if (o.name !== t.name) add("track", `renamed track ${o.name} → ${t.name}`, { trackId: id });
  }
  for (const [id, t] of A.tracks) if (!B.tracks.has(id)) add("track", `removed track ${t.name}`, { trackId: id });
  const ma = new Set((a.media || []).map((m) => m.id));
  const newMedia = (b.media || []).filter((m) => !ma.has(m.id));
  if (newMedia.length) add("media", `imported ${newMedia.length} file${newMedia.length > 1 ? "s" : ""}: ${newMedia.map((m) => m.file).join(", ")}`);
  if (JSON.stringify(a.project) !== JSON.stringify(b.project)) add("project", "project settings changed");
  return changes;
}
