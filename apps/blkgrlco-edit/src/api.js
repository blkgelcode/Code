// Talking to the local server: REST for actions, one WebSocket for live updates.
export async function getState() {
  const r = await fetch("/api/state");
  return r.json();
}

export async function putTimeline(timeline, baseRevision) {
  const r = await fetch("/api/timeline", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeline, baseRevision }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

export const post = (url) => fetch(url, { method: "POST" }).then((r) => r.json());

/** Keeps a WebSocket open, reconnecting with backoff. Returns a close function. */
export function connect(onMessage, onStatus) {
  let ws;
  let closed = false;
  let delay = 500;
  const open = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => { delay = 500; onStatus(true); };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      onStatus(false);
      if (!closed) setTimeout(open, (delay = Math.min(delay * 2, 8000)));
    };
  };
  open();
  return () => { closed = true; ws?.close(); };
}

export const fmtTime = (s, withFrames = false) => {
  if (!Number.isFinite(s)) return "–";
  const sign = s < 0 ? "-" : "";
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${sign}${m}:${sec.toFixed(withFrames ? 2 : 1).padStart(withFrames ? 5 : 4, "0")}`;
};
