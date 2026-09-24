#!/usr/bin/env node
// Checks dashboard/omnia-os.html for errors before it is published.
// Run: node dashboard/check.js            (exit code 0 = clean, 1 = problems)
// Needs: node 18+; playwright + a Chromium for the browser checks (skipped with a warning if missing).

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "omnia-os.html");
const MAX_TOOLS = 16;                 // hard limit of the "ask Claude" runtime
const CDN_OK = ["https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net/npm/", "https://unpkg.com", "https://cdn.tailwindcss.com", "https://code.jquery.com"];
const results = [];
const ok = (name, detail) => results.push({ ok: true, name, detail });
const bad = (name, detail) => results.push({ ok: false, name, detail });

const src = fs.readFileSync(FILE, "utf8");
const scriptStart = src.indexOf("<script>"), scriptEnd = src.lastIndexOf("</script>");
const js = src.slice(scriptStart + 8, scriptEnd);
const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];

/* 1. JavaScript syntax */
try { new Function(js); ok("JavaScript syntax", "parses"); }
catch (e) { bad("JavaScript syntax", e.message); }

/* 2. Page tools within the runtime limit */
const toolNames = [...js.matchAll(/\n\s{4}t\("(\w+)"/g)].map(m => m[1]);
if (toolNames.length <= MAX_TOOLS) ok("Page tools", `${toolNames.length} of ${MAX_TOOLS}: ${toolNames.join(", ")}`);
else bad("Page tools", `${toolNames.length} tools; the runtime allows ${MAX_TOOLS}. Merge some.`);
const dupTools = toolNames.filter((n, i) => toolNames.indexOf(n) !== i);
if (dupTools.length) bad("Page tools", "duplicate names: " + dupTools.join(", "));

/* 3. Routine prompts only name tools that exist */
const mentioned = [...js.matchAll(/\b(with|using|via) (\w+)(?:\/(\w+))?/g)].flatMap(m => [m[2], m[3]]).filter(Boolean);
const missing = [...new Set(mentioned)].filter(n => /^[a-z]+[A-Z]\w+$/.test(n) && !toolNames.includes(n) && !js.includes(`function ${n}(`));
if (missing.length) bad("Tool names in prompts", "prompts mention tools that don't exist: " + missing.join(", ")); else ok("Tool names in prompts", "all resolve");

/* 4. Head: title, fonts, external resources on the allowlist */
if (/^<title>[^<]{2,60}<\/title>/.test(src.trimStart())) ok("Title", src.match(/<title>([^<]+)/)[1]); else bad("Title", "missing or not first");
const ext = [...src.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(u => !u.includes("claude.ai/artifact"));
const badExt = ext.filter(u => !(u.startsWith("https://fonts.googleapis.com") || u.startsWith("https://fonts.gstatic.com") || CDN_OK.some(c => u.startsWith(c))));
if (badExt.length) bad("External resources", "not on the CSP allowlist: " + badExt.join(", ")); else ok("External resources", `${ext.length} allowed`);
if (/Cormorant|font-style:\s*italic/.test(src)) bad("Design", "serif/italic still present (redesign said Inter only)"); else ok("Design", "Inter only, no italics");

/* 5. Theme tokens defined in light and both dark blocks */
const lightTokens = new Set([...(css.match(/:root\{([^}]*)\}/) || [, ""])[1].matchAll(/--([\w-]+):/g)].map(m => m[1]));
const usedTokens = new Set([...src.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1]));
const undef = [...usedTokens].filter(t => !lightTokens.has(t));
if (undef.length) bad("CSS tokens", "used but never defined on :root: " + undef.join(", ")); else ok("CSS tokens", `${usedTokens.size} tokens all defined`);
const darkBlocks = (css.match(/color-scheme:dark/g) || []).length;
if (darkBlocks >= 2) ok("Dark mode", "system + explicit blocks present"); else bad("Dark mode", "expected two dark token blocks");

/* 6. Capabilities the code calls are ones the page can declare */
const caps = [...js.matchAll(/use\("(\w+)"\)/g)].map(m => m[1]);
const allowed = ["db", "assets", "mcp", "sample", "permissions", "artifact", "user", "room", "downloads", "files", "comments"];
const badCaps = caps.filter(c => !allowed.includes(c));
if (badCaps.length) bad("Capabilities", "unknown: " + badCaps.join(", ")); else ok("Capabilities", [...new Set(caps)].join(", "));

/* 7. Every data-act the HTML emits has a handler */
const acts = new Set([...js.matchAll(/data-act="([\w-]+)"/g)].map(m => m[1]));
const handled = new Set([...js.matchAll(/case "([\w-]+)":/g)].map(m => m[1]).concat([...js.matchAll(/a === "([\w-]+)"/g)].map(m => m[1])));
const unhandled = [...acts].filter(a => !handled.has(a));
if (unhandled.length) bad("Click handlers", "no handler for: " + unhandled.join(", ")); else ok("Click handlers", `${acts.size} actions wired`);

/* 8. Browser checks (skipped if playwright/chromium missing) */
(async () => {
  let chromium;
  try { chromium = require("playwright").chromium; } catch { try { chromium = require(path.join(process.env.HOME || "", "node_modules/playwright")).chromium; } catch {} }
  const exe = ["/opt/pw-browsers/chromium", process.env.CHROME_PATH].find(p => p && fs.existsSync(p));
  if (!chromium) results.push({ ok: true, warn: true, name: "Browser checks", detail: "skipped: playwright not installed (npm i playwright)" });
  else {
    let b;
    try {
      b = await chromium.launch(exe ? { executablePath: exe } : {});
      for (const [w, h, name] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
        const errs = [];
        const p = await b.newPage({ viewport: { width: w, height: h } });
        p.on("pageerror", e => errs.push(e.message));
        p.on("console", m => { if (m.type() === "error" && !/ERR_CERT|ERR_NAME|fonts|net::/.test(m.text())) errs.push("console: " + m.text()); });
        // mocked runtime so the assistant path runs end to end
        await p.addInitScript(() => {
          let state = "prompt";
          window.claude = { use: async n => ({
            permissions: { state: async () => state, request: async () => { state = "granted"; return { sample: "granted" }; } },
            sample: Object.assign(async (input, opts) => {
              if (opts.tools && opts.tools.length > 16) { const e = new Error("at most 16 tools per call (got " + opts.tools.length + ")"); e.code = "invalid_request"; throw e; }
              for (const t of opts.tools || []) { const r = t.execute(t.name === "addTask" ? { title: "mock task" } : t.name === "logWorkout" ? { lift: true, protein: 150 } : t.name === "updateGoal" ? { lane: "Hot", text: "mock", target: 2 } : t.name === "addIdea" ? { text: "mock idea" } : t.name === "updateCard" ? { title: "mock card", stage: "Filmed" } : t.name === "logSavings" ? { amount: 10 } : t.name === "setBill" ? { name: "Mock", amount: 5, day: 3 } : t.name === "planPaycheck" ? { date: "2026-10-02", amount: 100 } : t.name === "buildShotList" ? { shots: [{ shot: "wide" }] } : t.name === "saveNote" ? { kind: "review", text: "ok" } : t.name === "moveTask" ? { id: "nope" } : t.name === "proposeCalendarEvent" ? { title: "Mock", date: "2026-10-01", start: "09:00", end: "10:00" } : t.name === "draftEmail" ? { subject: "Mock", body: "hi" } : {}, {}); if (r && r.then) r.catch(() => {}); }
              opts.onText?.({ text: "mock answer", delta: "" }); return { text: "mock answer", truncated: false, modelTierApplied: "default" }; },
            { limits: async () => ({ maxPromptBytes: 100000, tools: { maxCount: 16 } }), json: async () => ({ priorities: [{ text: "a", brand: "life" }], coaching: "b" }) }),
          })[n] ?? null };
        });
        await p.goto("file://" + FILE);
        await p.waitForTimeout(400);
        for (const t of ["today", "week", "studio", "hhh", "body", "money", "travel", "review"]) {
          await p.click(`[data-act="tab"][data-v="${t}"]:visible`); await p.waitForTimeout(60);
          const sw = await p.evaluate(() => document.documentElement.scrollWidth);
          if (sw > w) errs.push(`${t}: page scrolls sideways (${sw}px > ${w}px)`);
        }
        await p.click('[data-act="tab"][data-v="today"]:visible');
        await p.fill("#askin", "check"); await p.press("#askin", "Enter"); await p.waitForTimeout(600);
        const reply = await p.textContent("#thread");
        if (!/mock answer/.test(reply)) errs.push("assistant round-trip failed: " + reply.replace(/\s+/g, " ").slice(0, 160));
        const toolsRan = await p.evaluate(() => document.querySelectorAll(".msg .tools span").length);
        if (toolsRan < 10) errs.push(`only ${toolsRan} page tools executed in the mock run`);
        await p.evaluate(() => localStorage.clear());
        if (errs.length) bad(`Browser (${name})`, errs.join(" | ")); else ok(`Browser (${name})`, "all tabs render, no sideways scroll, assistant + tools run");
      }
    } catch (e) { bad("Browser checks", e.message.split("\n")[0]); }
    finally { if (b) await b.close(); }
  }
  const fails = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? (r.warn ? "⚠" : "✓") : "✗"} ${r.name} — ${r.detail}`);
  console.log(fails.length ? `\n${fails.length} problem${fails.length > 1 ? "s" : ""} found.` : "\nClean. Safe to publish.");
  process.exit(fails.length ? 1 : 0);
})();
