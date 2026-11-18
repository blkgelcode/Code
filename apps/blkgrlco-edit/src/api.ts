// Talking to the local server: REST for actions, one WebSocket for live updates.
import type { Op } from "../shared/ops";

export interface Reply<T = any> { status: number; body: T }

async function call<T = any>(method: string, url: string, body?: unknown): Promise<Reply<T>> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

export const api = {
  state: () => call("GET", "/api/state").then((r) => r.body),
  ops: (ops: Op[]) => call("POST", "/api/ops", { ops, author: "you" }),
  undo: () => call("POST", "/api/undo", { author: "you" }),
  redo: () => call("POST", "/api/redo", { author: "you" }),
  revert: (rev: number) => call("POST", "/api/revert", { rev, author: "you" }),
  restore: (rev: number) => call("POST", "/api/restore", { rev, author: "you" }),
  importPaths: (paths: string[]) => call("POST", "/api/import", { paths, author: "you" }),
  exportMp4: (sequence?: string) => call("POST", "/api/export", { sequence }),
  cancelExport: (id: string) => call("POST", `/api/export/${id}/cancel`),
};

/** Keeps a WebSocket open, reconnecting with backoff. Returns a close function. */
export function connect(onMessage: (m: any) => void, onStatus: (up: boolean) => void) {
  let ws: WebSocket | undefined;
  let closed = false;
  let delay = 500;
  const open = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => { delay = 500; onStatus(true); };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => { onStatus(false); if (!closed) setTimeout(open, (delay = Math.min(delay * 2, 8000))); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}

export const fmtTime = (s: number, withFrames = false) => {
  if (!Number.isFinite(s)) return "–";
  const sign = s < 0 ? "-" : "";
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${sign}${m}:${sec.toFixed(withFrames ? 2 : 1).padStart(withFrames ? 5 : 4, "0")}`;
};

/** The Mac app (Electron) exposes native pickers and real file paths; a plain browser can't. */
export interface NativeBridge {
  pickMedia(): Promise<string[]>;
  pickFolder(): Promise<string[]>;
  pathsForFiles(files: File[]): string[];
  onMenu(cb: (action: string) => void): () => void;
  reveal?(path: string): void;
}
export const native: NativeBridge | undefined = (window as any).blkedit;
