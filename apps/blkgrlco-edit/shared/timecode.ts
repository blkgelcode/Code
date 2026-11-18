// Timecode: HH:MM:SS:FF (non-drop-frame; 29.97/59.94 count as 30/60 frames a second, like most
// editors' NDF display) and parsing whatever she types into the jump box.

const nominal = (fps: number) => Math.round(fps) || 30;

/** 65.5 s at 30 fps → "00:01:05:15" */
export function toTimecode(t: number, fps: number): string {
  const f = nominal(fps);
  const total = Math.max(0, Math.round(t * fps + 1e-6));
  const ff = total % f;
  const s = Math.floor(total / f);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}

/**
 * Parse a typed time. Accepts:
 *   "00:01:05:15" / "1:05:15" (timecode with frames, ':' or ';')
 *   "1:05", "1:05.5", "0:05", "65.5", "65s"   (minutes:seconds or seconds)
 *   "120f"                                    (frames)
 *   "+10", "-2s", "+15f"                      (relative to `from`)
 *   "105" with `digitsAsTimecode` (Premiere-style: last two digits are frames → 1 s 05 f)
 * Returns seconds, or null if it can't be read.
 */
export function parseTimecode(input: string, fps: number, from = 0, digitsAsTimecode = false): number | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  let sign = 0;
  if (s[0] === "+" || s[0] === "-") { sign = s[0] === "+" ? 1 : -1; s = s.slice(1).trim(); }
  const f = nominal(fps);
  let v: number | null = null;
  if (/^\d+f$/.test(s)) v = Number(s.slice(0, -1)) / fps;
  else if (/^\d+(\.\d+)?s$/.test(s)) v = Number(s.slice(0, -1));
  else if (/^\d+([:;]\d{1,2}){3}$/.test(s) || (/^\d+([:;]\d{1,2}){2}$/.test(s) && !s.includes("."))) {
    const parts = s.split(/[:;]/).map(Number);
    if (parts.length === 3) parts.unshift(0);
    const [h, m, sec, fr] = parts;
    if (fr >= f) return null;
    v = h * 3600 + m * 60 + sec + fr / fps;
  } else if (/^\d+:\d{1,2}(\.\d+)?$/.test(s)) {
    const [m, sec] = s.split(":");
    v = Number(m) * 60 + Number(sec);
  } else if (/^\d+$/.test(s) && digitsAsTimecode) {
    const d = s.padStart(8, "0").slice(-8);
    const [h, m, sec, fr] = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6, 8)].map(Number);
    v = h * 3600 + m * 60 + sec + Math.min(fr, f - 1) / fps;
  } else if (/^\d+(\.\d+)?$/.test(s)) v = Number(s);
  if (v === null || !Number.isFinite(v)) return null;
  const out = sign ? from + sign * v : v;
  return Math.max(0, Math.round(out * fps) / fps);
}
