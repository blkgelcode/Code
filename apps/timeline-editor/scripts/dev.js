// npm run dev:   the timeline server and the Vite dev server together.
// npm start:     (after vite build) just the server, serving the built app.
//
// The server is supervised: if it ever exits unexpectedly it's restarted after a
// moment, and open browsers reconnect by themselves. Nothing is lost: every
// change is already on disk, and the job queue rebuilds itself from the cache.
import { spawn } from "node:child_process";

const withVite = !process.argv.includes("--server-only");
let stopping = false;
const procs = new Set();

function supervise(name, cmd, args) {
  let restarts = [];
  const start = () => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    procs.add(p);
    p.on("exit", (code, signal) => {
      procs.delete(p);
      if (stopping) return;
      restarts = restarts.filter((t) => Date.now() - t < 60000);
      if (restarts.length >= 5) {
        console.error(`[supervisor] ${name} keeps exiting (${code ?? signal}); giving up. Check the messages above.`);
        stop();
        return;
      }
      restarts.push(Date.now());
      console.error(`[supervisor] ${name} exited (${code ?? signal}); restarting in 1s…`);
      setTimeout(start, 1000);
    });
  };
  start();
}

function stop() {
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

supervise("server", "node", ["server/index.js"]);
if (withVite) supervise("vite", "npx", ["vite", "--port", process.env.VITE_PORT || "5173", "--strictPort"]);
