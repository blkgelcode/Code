// Bundles the server and the Electron shell into plain JavaScript (the UI is built by Vite).
import { build } from "esbuild";

await build({ entryPoints: ["server/index.ts"], outfile: "dist-server/server.mjs", bundle: true, platform: "node", format: "esm", target: "node20", packages: "external", sourcemap: true, logLevel: "warning" });
await build({ entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs", bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "warning" });
await build({ entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs", bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "warning" });
console.log("built dist-server/ and dist-electron/");
