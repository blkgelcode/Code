// Flatten a sequence for playback and export: nested sequences (compound clips) are expanded
// into ordinary clips at the right time and layer, and a picture clip linked to its own sound on
// an audio track goes silent (the audio clip carries the sound, so it isn't heard twice).
// The result is a plain Sequence with only media and text clips; it's never saved.
import { clipEnd, isNested, isText, r6, type Clip, type MediaClip, type Sequence, type TextClip, type Timeline, type Track } from "./model";

const MAX_DEPTH = 8;

/** Video clips whose sound is carried by a linked audio clip of the same media. */
export function silentLinked(seq: Sequence): Set<string> {
  const audioByLink = new Map<string, Set<string>>();
  for (const t of seq.tracks) if (t.kind === "audio") for (const c of t.clips as MediaClip[]) {
    if (!c.link || !c.media) continue;
    if (!audioByLink.has(c.link)) audioByLink.set(c.link, new Set());
    audioByLink.get(c.link)!.add(c.media);
  }
  const out = new Set<string>();
  for (const t of seq.tracks) if (t.kind === "video") for (const c of t.clips as MediaClip[]) {
    if (c.link && c.media && audioByLink.get(c.link)?.has(c.media)) out.add(c.id);
  }
  return out;
}

export function flatten(tl: Timeline, seqId = tl.activeSequence, depth = 0): Sequence {
  const seq = tl.sequences.find((s) => s.id === seqId);
  if (!seq) throw new Error(`sequence ${seqId} doesn't exist`);
  const silent = silentLinked(seq);
  const tracks: Track[] = [];
  for (const track of seq.tracks) {
    const base: Clip[] = [];
    const nestedTracks: Track[] = [];
    for (const c of track.clips) {
      if (!isNested(c)) {
        base.push(silent.has(c.id) ? { ...(c as MediaClip), volume: 0 } : c);
        continue;
      }
      if (depth >= MAX_DEPTH || !tl.sequences.some((s) => s.id === c.seq) || c.seq === seqId) continue;
      const child = flatten(tl, c.seq, depth + 1);
      const childSolo = child.tracks.some((t) => t.kind !== "text" && t.solo);
      const offset = c.start - c.in; // child time → parent time
      for (const ct of child.tracks) {
        const clips: Clip[] = [];
        for (const k of ct.clips) {
          const a = Math.max(k.start, c.in), b = Math.min(clipEnd(k), c.out);
          if (b - a < 1e-6) continue;
          const head = a - k.start;
          const start = r6(a + offset);
          const atIn = Math.abs(a - c.in) < 1e-6, atOut = Math.abs(b - c.out) < 1e-6;
          if (isText(k)) {
            const x: TextClip = { ...k, id: `${c.id}_${k.id}`, start, duration: r6(b - a) };
            if (head > 0) x.fadeIn = 0;
            if (b < clipEnd(k) - 1e-6) x.fadeOut = 0;
            if (atIn && c.fadeIn) x.fadeIn = Math.max(x.fadeIn, c.fadeIn);
            if (atOut && c.fadeOut) x.fadeOut = Math.max(x.fadeOut, c.fadeOut);
            clips.push(x);
          } else {
            const m = k as MediaClip;
            const x: MediaClip = { ...m, id: `${c.id}_${m.id}`, start, in: r6(m.in + head), out: r6(m.in + head + (b - a)), volume: r6(m.volume * c.volume) };
            if (head > 0) x.fadeIn = 0;
            if (b < clipEnd(k) - 1e-6) x.fadeOut = 0;
            if (atIn && c.fadeIn) x.fadeIn = Math.max(x.fadeIn, c.fadeIn);
            if (atOut && c.fadeOut) x.fadeOut = Math.max(x.fadeOut, c.fadeOut);
            if (ct.kind === "video" && c.fit === "contain") x.fit = "contain";
            delete x.link;
            clips.push(x);
          }
        }
        nestedTracks.push({
          ...ct, id: `${track.id}_${c.id}_${ct.id}`, clips,
          hidden: track.hidden || ct.hidden,
          muted: track.muted || ct.muted || (childSolo && ct.kind !== "text" && !ct.solo),
          solo: track.solo, volume: r6((track.volume ?? 1) * (ct.volume ?? 1)), locked: true,
        });
      }
    }
    tracks.push({ ...track, clips: base });
    tracks.push(...nestedTracks);
  }
  return { ...seq, tracks };
}

/** A copy of the timeline whose active sequence is flattened (what the player and audio engine read). */
export function flattenedTimeline(tl: Timeline): Timeline {
  if (!tl.sequences.some((s) => s.tracks.some((t) => t.clips.some((c) => isNested(c) || (c as MediaClip).link)))) return tl;
  const flat = flatten(tl);
  return { ...tl, sequences: tl.sequences.map((s) => (s.id === flat.id ? flat : s)) };
}
