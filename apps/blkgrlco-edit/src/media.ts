// Media status as the server reports it, plus small helpers the UI shares.
import type { Media } from "../shared/model";

export type AssetState = "ready" | "queued" | "running" | "error" | "n/a" | "waiting";
export interface AssetStatus { state: AssetState; progress?: number; error?: string; encoder?: string }
export interface MediaStatus { online: boolean; thumb: AssetStatus; proxy: AssetStatus; strip: AssetStatus; wave: AssetStatus; still: AssetStatus }
export interface QueueInfo { running: number; queued: number; max: number; encoder: string }

/** Can this clip be put on the timeline yet? Video needs its proxy, photos their still. */
export function usable(m: Media, st?: MediaStatus) {
  if (!st) return false;
  if (m.type === "video") return st.proxy.state === "ready";
  if (m.type === "image") return st.still.state === "ready";
  return true;
}

/** The one line that sums up where a clip is. */
export function headline(m: Media, st?: MediaStatus): { kind: "ok" | "work" | "error" | "offline"; text: string; progress?: number } {
  if (!st) return { kind: "work", text: "reading…" };
  if (!st.online) return { kind: "offline", text: "Offline — drive unplugged or file moved" };
  const errs = (["proxy", "thumb", "still", "wave", "strip"] as const).filter((k) => st[k].state === "error");
  if (errs.length) return { kind: "error", text: `${errs[0] === "proxy" ? "Preview" : errs[0]} failed: ${st[errs[0]].error || "unknown error"}` };
  const main = m.type === "video" ? st.proxy : m.type === "image" ? st.still : st.wave;
  const what = m.type === "audio" ? "waveform" : "preview";
  if (main.state === "running") return { kind: "work", text: `making ${what} ${Math.round((main.progress || 0) * 100)}%`, progress: main.progress || 0 };
  if (main.state === "queued" || main.state === "waiting") return { kind: "work", text: `${what} queued`, progress: 0 };
  const extra = (["thumb", "strip", "wave"] as const).find((k) => st[k].state === "running" || st[k].state === "queued");
  if (extra) return { kind: "ok", text: `ready · ${extra === "wave" ? "waveform" : extra === "strip" ? "filmstrip" : "thumbnail"} coming` };
  return { kind: "ok", text: "ready" };
}

/** Short format badges: 4K · 60 · HEVC · 10-bit · HDR · VFR. */
export function badges(m: Media): string[] {
  const out: string[] = [];
  if (m.width && m.height) {
    const long = Math.max(m.width, m.height);
    out.push(long >= 3800 ? "4K" : long >= 2500 ? "2.7K" : long >= 1900 ? "HD" : `${m.width}×${m.height}`);
    if (m.height > m.width) out.push("vertical");
  }
  if (m.fps) out.push(`${Math.round(m.fps * 100) / 100}fps`);
  if (m.codec && m.type !== "image") out.push(m.codec.toUpperCase().replace("H264", "H.264").replace("HEVC", "HEVC"));
  if (m.bitDepth && m.bitDepth > 8) out.push(`${m.bitDepth}-bit`);
  if (m.hdr) out.push(m.hdr === "hlg" ? "HDR HLG" : "HDR PQ");
  if (m.vfr) out.push("VFR");
  return out;
}

/** Cache-busting version for asset URLs: changes when the asset becomes ready. */
export const ver = (st: AssetStatus | undefined) => (st?.state === "ready" ? "r" : st?.state || "x");
