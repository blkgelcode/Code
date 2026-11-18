// timeline.json v2: schema, validation, normalization and migration from v1.
// Shared by the server, the UI and Claude's CLI so all three agree on what a valid edit is.
import { z } from "zod";

export const SCHEMA_VERSION = 2;

// ------------------------------------------------------------------ schema
const num = z.number().finite();
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "ids are letters, digits, - or _ (start with a letter)");
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'colors are "#RRGGBB"');

export const TextStyleSchema = z.object({
  font: z.string().default("default"),
  size: num.positive().default(96),
  color: hex.default("#FFFFFF"),
  x: num.min(0).max(1).default(0.5),
  y: num.min(0).max(1).default(0.5),
  align: z.enum(["left", "center", "right"]).default("center"),
  bold: z.boolean().default(true),
  shadow: z.boolean().default(false),
}).strict();

export const MediaClipSchema = z.object({
  id,
  media: id,
  start: num.min(0),
  in: num.min(0),
  out: num.positive(),
  volume: num.min(0).max(4).default(1),
  fit: z.enum(["cover", "contain"]).optional(),
  fadeIn: num.min(0).default(0),
  fadeOut: num.min(0).default(0),
  label: z.string().optional(),
}).strict();

export const TextClipSchema = z.object({
  id,
  start: num.min(0),
  duration: num.positive(),
  text: z.string(),
  style: TextStyleSchema.default({}),
  fadeIn: num.min(0).default(0),
  fadeOut: num.min(0).default(0),
  label: z.string().optional(),
}).strict();

export const TrackSchema = z.object({
  id,
  kind: z.enum(["video", "audio", "text"]),
  name: z.string().default(""),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(z.record(z.unknown())), // checked per track kind in validate()
}).strict();

export const MediaSchema = z.object({
  id,
  path: z.string().min(1),                 // absolute path on disk; never copied
  name: z.string().optional(),             // display name (defaults to the file name)
  type: z.enum(["video", "audio", "image"]),
  duration: num.positive().nullable(),     // seconds; null for images
  width: num.positive().optional(),
  height: num.positive().optional(),
  fps: num.positive().optional(),
  hasAudio: z.boolean().optional(),
  codec: z.string().optional(),
}).strict();

export const SequenceSchema = z.object({
  id,
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: num.positive(),
  background: hex.default("#000000"),
  tracks: z.array(TrackSchema),
}).strict();

export const TimelineSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  project: z.object({
    name: z.string().default("Untitled"),
    brand: z.enum(["blkgrlco", "blkgrlcotoo", "podcast"]).nullable().default(null),
  }).strict(),
  media: z.array(MediaSchema),
  sequences: z.array(SequenceSchema).min(1),
  activeSequence: id,
  nextId: z.number().int().positive(),
}).strict();

export type TextStyle = z.infer<typeof TextStyleSchema>;
export type MediaClip = z.infer<typeof MediaClipSchema>;
export type TextClip = z.infer<typeof TextClipSchema>;
export type Clip = MediaClip | TextClip;
export type Track = Omit<z.infer<typeof TrackSchema>, "clips"> & { clips: Clip[] };
export type Media = z.infer<typeof MediaSchema>;
export type Sequence = Omit<z.infer<typeof SequenceSchema>, "tracks"> & { tracks: Track[] };
export type Timeline = Omit<z.infer<typeof TimelineSchema>, "sequences"> & { sequences: Sequence[] };
export type TrackKind = Track["kind"];

// ------------------------------------------------------------------ helpers
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
export const isText = (c: Clip): c is TextClip => (c as TextClip).text !== undefined;
export const clipLength = (c: Clip) => (isText(c) ? c.duration : c.out - c.in);
export const clipEnd = (c: Clip) => c.start + clipLength(c);
export const sequenceDuration = (s: Sequence) => {
  let end = 0;
  for (const t of s.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return r6(end);
};
export const activeSeq = (tl: Timeline) => tl.sequences.find((s) => s.id === tl.activeSequence) || tl.sequences[0];
export const mediaName = (m: Media) => m.name || m.path.split(/[\\/]/).pop() || m.id;

export function findClip(tl: Timeline, clipId: string) {
  for (const seq of tl.sequences) for (const track of seq.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track, seq };
  }
  return null;
}

export function acceptsMedia(kind: TrackKind, type: Media["type"] | undefined) {
  if (kind === "video") return type === "video" || type === "image";
  if (kind === "audio") return type === "audio" || type === "video";
  return false;
}

export function emptyTimeline(name = "Untitled"): Timeline {
  return {
    version: SCHEMA_VERSION,
    project: { name, brand: "blkgrlco" },
    media: [],
    sequences: [{
      id: "s1", name: "Main", width: 1080, height: 1920, fps: 30, background: "#000000",
      tracks: [
        { id: "v1", kind: "video", name: "Video 1", muted: false, hidden: false, locked: false, clips: [] },
        { id: "a1", kind: "audio", name: "Audio 1", muted: false, hidden: false, locked: false, clips: [] },
        { id: "t1", kind: "text", name: "Text 1", muted: false, hidden: false, locked: false, clips: [] },
      ],
    }],
    activeSequence: "s1",
    nextId: 1,
  };
}

// ------------------------------------------------------------------ validation
export interface Validation { ok: boolean; value?: Timeline; errors: string[]; warnings: string[] }

function issuePath(raw: any, p: (string | number)[]) {
  // Turn ["sequences",0,"tracks",1,"clips",2,"out"] into "s1 › v2 › c5.out" using real ids.
  const parts: string[] = [];
  let node = raw;
  for (let i = 0; i < p.length; i++) {
    const k = p[i];
    node = node?.[k];
    if (typeof k === "number") {
      const nodeId = node && typeof node === "object" && typeof node.id === "string" ? node.id : `#${k}`;
      parts.push(nodeId);
    } else if (!["sequences", "tracks", "clips", "media"].includes(k)) parts.push(k);
  }
  return parts.join(" › ").replace(/ › (?=[a-z]+$)/i, ".") || "(top level)";
}

export function validate(raw: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = TimelineSchema.safeParse(raw);
  if (!parsed.success) {
    for (const iss of parsed.error.issues.slice(0, 20)) {
      const msg = iss.code === "unrecognized_keys" ? `unknown field${iss.keys.length > 1 ? "s" : ""} ${iss.keys.map((k) => `"${k}"`).join(", ")}` : iss.message;
      errors.push(`${issuePath(raw, iss.path)}: ${msg}`);
    }
    return { ok: false, errors, warnings };
  }
  const tl = parsed.data as unknown as Timeline;
  const media = new Map<string, Media>();
  for (const m of tl.media) {
    if (media.has(m.id)) errors.push(`duplicate media id ${m.id}`);
    media.set(m.id, m);
  }
  const clipIds = new Set<string>();
  const seqIds = new Set<string>();
  let maxN = 0;
  for (const seq of tl.sequences) {
    if (seqIds.has(seq.id)) errors.push(`duplicate sequence id ${seq.id}`);
    seqIds.add(seq.id);
    const trackIds = new Set<string>();
    for (const track of seq.tracks) {
      if (trackIds.has(track.id)) errors.push(`${seq.id}: duplicate track id ${track.id}`);
      trackIds.add(track.id);
      const clips: Clip[] = [];
      track.clips.forEach((rawClip, i) => {
        const schema = track.kind === "text" ? TextClipSchema : MediaClipSchema;
        const r = schema.safeParse(rawClip);
        const cid = typeof rawClip.id === "string" ? rawClip.id : `#${i}`;
        const where = `${seq.id} › ${track.id} › ${cid}`;
        if (!r.success) {
          if (track.kind !== "text" && "text" in rawClip) errors.push(`${where}: text clips belong on a text track`);
          else if (track.kind === "text" && "media" in rawClip) errors.push(`${where}: media clips belong on a video or audio track`);
          else for (const iss of r.error.issues) {
            const field = iss.path.join(".");
            const msg = iss.code === "unrecognized_keys" ? `unknown field${iss.keys.length > 1 ? "s" : ""} ${iss.keys.map((k) => `"${k}"`).join(", ")}` : iss.message;
            errors.push(`${where}${field ? "." + field : ""}: ${msg}`);
          }
          return;
        }
        const c = r.data as Clip;
        clips.push(c);
        if (clipIds.has(c.id)) errors.push(`duplicate clip id ${c.id}`);
        clipIds.add(c.id);
        const n = Number(/^c(\d+)$/.exec(c.id)?.[1] || 0);
        if (n > maxN) maxN = n;
        if (!isText(c)) {
          const m = media.get(c.media);
          if (!m) { errors.push(`${where}: media "${c.media}" isn't in the media list`); return; }
          if (c.out <= c.in) errors.push(`${where}: out (${c.out}) must be after in (${c.in})`);
          if (m.duration != null && c.out > m.duration + 0.05) errors.push(`${where}: out (${c.out}) is past the end of ${mediaName(m)} (${m.duration}s)`);
          if (!acceptsMedia(track.kind, m.type)) errors.push(`${where}: ${mediaName(m)} is ${m.type}; it can't go on a ${track.kind} track`);
        }
      });
      (track as Track).clips = clips;
      const sorted = [...clips].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        if (clipEnd(sorted[i - 1]) > sorted[i].start + 1e-4)
          warnings.push(`${sorted[i - 1].id} and ${sorted[i].id} overlap on ${seq.id} › ${track.id}`);
      }
    }
  }
  if (!seqIds.has(tl.activeSequence)) errors.push(`activeSequence "${tl.activeSequence}" isn't a sequence id`);
  if (tl.nextId <= maxN) warnings.push(`nextId was ${tl.nextId}; bumped past c${maxN}`);
  return errors.length ? { ok: false, errors, warnings } : { ok: true, value: tl, errors, warnings };
}

// ------------------------------------------------------------------ normalization
/** Snap to a frame grid of `fps`, to 6 decimals. Values already on the grid are unchanged. */
export function toGrid(t: number, fps: number) {
  const f = Math.round(t * fps);
  const snapped = f / fps;
  return Math.abs(snapped - t) < 1e-6 ? r6(t) : r6(snapped);
}

/**
 * The canonical form written to disk: defaults filled, clips sorted by start, timeline
 * positions and lengths on the sequence's frame grid, source in-points on the source's grid,
 * nextId past every clip id. Input must already be valid.
 */
export function normalize(tl: Timeline): Timeline {
  const out: Timeline = structuredClone(tl);
  const media = new Map(out.media.map((m) => [m.id, m]));
  let maxN = 0;
  for (const seq of out.sequences) {
    for (const track of seq.tracks) {
      if (!track.name) track.name = track.id;
      for (const c of track.clips) {
        const n = Number(/^c(\d+)$/.exec(c.id)?.[1] || 0);
        if (n > maxN) maxN = n;
        c.start = toGrid(c.start, seq.fps);
        if (isText(c)) {
          c.duration = Math.max(toGrid(c.duration, seq.fps), r6(1 / seq.fps));
          continue;
        }
        const m = media.get(c.media)!;
        const srcFps = m.type === "video" && m.fps ? m.fps : seq.fps;
        c.in = toGrid(c.in, srcFps);
        let len = Math.max(toGrid(c.out - c.in, seq.fps), r6(1 / seq.fps));
        if (m.duration != null && c.in + len > m.duration + 1e-6) len = Math.max(r6(Math.floor((m.duration - c.in) * seq.fps + 1e-6) / seq.fps), r6(1 / seq.fps));
        c.out = r6(c.in + len);
        if (track.kind === "video" && !c.fit) c.fit = "cover";
      }
      track.clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id, undefined, { numeric: true }));
    }
  }
  out.nextId = Math.max(out.nextId, maxN + 1);
  return out;
}

export const canonicalText = (tl: Timeline) => JSON.stringify(tl, null, 2) + "\n";

// ------------------------------------------------------------------ migration
/** v1 (single timeline, media in project/media/) → v2 (sequences, absolute paths). */
export function migrate(raw: any, projectDir: string): { timeline: unknown; migrated: boolean } {
  if (!raw || typeof raw !== "object" || raw.version !== 1) return { timeline: raw, migrated: false };
  const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, "")}/${b}`;
  const p = raw.project || {};
  const v2 = {
    version: 2,
    project: { name: p.name || "Untitled", brand: "blkgrlco" },
    media: (raw.media || []).map((m: any) => {
      const e: any = { id: m.id, path: join(join(projectDir, "media"), m.file), name: m.file, type: m.type, duration: m.duration ?? null };
      for (const k of ["width", "height", "fps", "hasAudio"]) if (m[k] !== undefined && m[k] !== null) e[k] = m[k];
      return e;
    }),
    sequences: [{
      id: "s1", name: "Main", width: p.width || 1080, height: p.height || 1920, fps: p.fps || 30,
      background: p.background || "#000000",
      tracks: (raw.tracks || []).map((t: any) => ({
        id: t.id, kind: t.kind, name: t.name || t.id, muted: !!t.muted, hidden: !!t.hidden, locked: false,
        clips: (t.clips || []).map((c: any) => {
          const out: any = { ...c };
          if (t.kind === "text") out.style = { ...c.style };
          return out;
        }),
      })),
    }],
    activeSequence: "s1",
    nextId: raw.nextId || 1,
  };
  return { timeline: v2, migrated: true };
}
