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

export function fmtDur(t) {
  if (!Number.isFinite(t)) return "";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtBytes(n) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

/** "3840×2160 · 59.94fps · HEVC 10-bit HLG" */
export function describeMedia(m) {
  const parts = [];
  if (m.width) parts.push(`${m.width}×${m.height}`);
  if (m.fps) parts.push(`${m.fps}fps`);
  if (m.codec) parts.push(`${m.codec === "hevc" ? "HEVC" : m.codec === "h264" ? "H.264" : m.codec.toUpperCase()}${m.bitDepth && m.bitDepth > 8 ? ` ${m.bitDepth}-bit` : ""}${m.hdr ? ` ${m.hdr}` : ""}`);
  if (m.logProfile === "dlogm") parts.push("D-Log M");
  if (m.kind === "audio" && m.audioCodec) parts.push(m.audioCodec.toUpperCase());
  if (m.duration) parts.push(fmtDur(m.duration));
  if (m.size) parts.push(fmtBytes(m.size));
  return parts.join(" · ");
}

/** One-line state of a media item's background jobs. */
export function mediaState(st) {
  if (!st) return { label: "Checking…", busy: true };
  if (st.online === false) return { label: "Offline", offline: true };
  const errs = Object.entries(st.errors || {});
  if (errs.length && (st.jobs?.proxy === "error" || !st.ready)) return { label: `Failed: ${errs[0][1]}`, error: true };
  const p = st.progress || {};
  if (st.jobs?.proxy === "running") return { label: `Proxy ${Math.round((p.proxy || 0) * 100)}%`, busy: true, progress: p.proxy || 0 };
  if (st.jobs?.wave === "running") return { label: "Waveform…", busy: true, progress: p.wave || 0 };
  if (st.jobs?.thumb === "running") return { label: "Thumbnail…", busy: true, progress: 0 };
  if (!st.ready) return { label: "Queued", busy: true, progress: 0 };
  if (errs.length) return { label: `Ready (${errs[0][0]} failed)`, ready: true };
  if (Object.values(st.jobs || {}).some((j) => j === "queued" || j === "running")) return { label: "Ready · finishing", ready: true };
  return { label: "Ready", ready: true };
}

export function fmtClock(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const AUTHOR = {
  user: { label: "You", color: "var(--you)" },
  claude: { label: "Claude", color: "var(--claude)" },
  app: { label: "Auto-relink", color: "var(--muted)" },
};
