export function fmtTime(t, fps = 30) {
  if (!Number.isFinite(t)) return "–";
  const sign = t < 0 ? "-" : "";
  t = Math.abs(t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const fr = Math.floor((t % 1) * fps + 1e-6);
  return `${sign}${m}:${String(s).padStart(2, "0")}.${String(fr).padStart(2, "0")}`;
}

export const fmtSec = (t) => `${Math.round(t * 100) / 100}s`;

export function fmtClock(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const AUTHOR = {
  user: { label: "You", color: "var(--you)" },
  claude: { label: "Claude", color: "var(--claude)" },
};
