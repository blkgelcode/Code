// Run a command, collect stdout; stderr kept for error messages. Never throws synchronously.
import { spawn, type ChildProcess } from "node:child_process";

export interface RunOpts { timeoutMs?: number; nice?: boolean; onStderr?: (s: string) => void; onStdout?: (s: string) => void; onSpawn?: (p: ChildProcess) => void }

export function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    // Background work runs at low priority so playback and the UI stay smooth.
    const [c, a] = opts.nice && process.platform !== "win32" ? ["nice", ["-n", "10", cmd, ...args]] : [cmd, args];
    let p: ChildProcess;
    try { p = spawn(c, a, { stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return reject(e); }
    opts.onSpawn?.(p);
    let out = "", err = "";
    const timer = opts.timeoutMs ? setTimeout(() => { p.kill("SIGKILL"); err += `\n(timed out after ${opts.timeoutMs} ms)`; }, opts.timeoutMs) : null;
    p.stdout!.on("data", (d: Buffer) => { const s = String(d); out += s; opts.onStdout?.(s); });
    p.stderr!.on("data", (d: Buffer) => { const s = String(d); err = (err + s).slice(-6000); opts.onStderr?.(s); });
    p.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    p.on("close", (code, sig) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(cleanError(err) || `${cmd} stopped (${sig || code})`));
    });
  });
}

/** The useful last line of an ffmpeg/ffprobe error, without addresses and noise. */
export function cleanError(err: string) {
  const lines = err.split("\n").map((l) => l.replace(/\[[^\]]*@ 0x[0-9a-f]+\]\s*/g, "").replace(/^\/\S.*?: (?=[A-Z])/, "").trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !/^(Conversion failed|Error opening (input|output) files?|Error while|Exiting)/i.test(l));
  return (meaningful.slice(-2).join(" — ") || lines.slice(-1)[0] || "").slice(0, 300);
}
