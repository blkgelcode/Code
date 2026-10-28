"use strict";
/* Phase 4 tools: ingest a card, fix + proxies, flub & silence map, the LUT.
   Uses h(), api, toast, modal(), closeModal(), runJob(), progressBar(), S from app.js. */

const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; };
const today = () => new Date().toLocaleDateString("en-CA");

// ---------- ingest ----------
const I = { known: null, timer: null };

async function watchCards() {
  try {
    const r = await api.get("/api/ingest/sources");
    const paths = r.sources.map((s) => s.path);
    const btn = $("#card-alert");
    if (I.known && paths.some((p) => !I.known.includes(p))) toast(`Camera card connected: ${r.sources.find((s) => !I.known.includes(s.path)).label}`);
    I.known = paths;
    if (r.sources.length) {
      const s = r.sources[0];
      btn.textContent = `📷 ${s.device} card · ${s.files} files · Ingest`;
      btn.onclick = () => openIngest(s);
      btn.classList.remove("hidden");
    } else btn.classList.add("hidden");
  } catch (e) { /* server restarting */ }
  clearTimeout(I.timer);
  I.timer = setTimeout(watchCards, 8000);
}

async function openIngest(preset) {
  let info;
  try { info = await api.get("/api/ingest/sources"); } catch (e) { return toast(e.message, true); }
  let source = preset || info.sources[0] || null;
  const name = h("input", { class: "input", value: `${today()} `, placeholder: "e.g. 2026-10-27 sunday reset" });
  const pathIn = h("input", { class: "input", placeholder: "or type a folder path, e.g. ~/Desktop/iPhone export" });
  const srcBox = h("div", { class: "ingest-sources" });
  const out = h("div");
  const drawSources = () => put(srcBox, 
    ...(info.sources.length ? info.sources : []).map((s) => h("label", { class: "format" },
      h("input", { type: "radio", name: "src", checked: source && source.path === s.path, onchange: () => { source = s; } }),
      h("span", { class: "label" }, `📷 ${s.label}`), h("span", { class: "progress-text" }, `${s.device} · ${s.files} files · ${s.size}`))),
    source && !info.sources.some((s) => s.path === source.path) ? h("label", { class: "format" },
      h("input", { type: "radio", name: "src", checked: true }), h("span", { class: "label" }, `📁 ${source.label}`),
      h("span", { class: "progress-text" }, `${source.device} · ${source.files} files · ${source.size}`)) : null,
    !info.sources.length && !source ? h("p", { class: "progress-text" }, "No camera card found. Plug in the DJI's card (or the Pocket 3 in storage mode), or choose a folder of iPhone footage.") : null);
  drawSources();
  const pick = async () => {
    try {
      const r = await api.post("/api/ingest/pick");
      if (r.cancelled) return;
      source = r.source; drawSources();
    } catch (e) { toast(e.message, true); }
  };
  const usePath = async () => {
    try {
      const p = await api.post("/api/ingest/plan", { src: pathIn.value.trim(), name: name.value || "x" });
      source = { path: pathIn.value.trim(), label: pathIn.value.trim().split("/").pop(), device: p.device, files: p.files, size: p.size };
      drawSources();
    } catch (e) { toast(e.message, true); }
  };
  const start = async (ev) => {
    if (!source) return toast("Pick a card or folder first.", true);
    let plan;
    try { plan = await api.post("/api/ingest/plan", { src: source.path, name: name.value }); } catch (e) { return toast(e.message, true); }
    ev.target.disabled = true;
    const bar = progressBar();
    put(out, h("div", { class: "banner" }, `Copying ${plan.files} files (${plan.size}) to ${plan.raw}`,
      plan.exists ? " (this project already exists: files already there are checked, not copied again)" : ""), bar);
    try {
      const r = await runJob("/api/ingest/start", { src: source.path, name: name.value }, bar.update);
      put(out, 
        h("div", { class: "verdict " + (r.safe_to_wipe ? "ok" : "bad") },
          h("b", {}, r.safe_to_wipe ? "✓ Safe to wipe the card" : "✗ Not safe to wipe the card"),
          h("span", {}, `${r.matched} of ${r.files} files match their checksum (SHA-256, read back from the T7).`)),
        r.problems.length ? h("table", { class: "ops" }, h("tbody", {}, ...r.problems.map((p) =>
          h("tr", {}, h("td", {}, p.source), h("td", { class: "flag" }, p.result))))) : null,
        h("p", { class: "progress-text" }, "Report: ", h("code", {}, r.report), ". Nothing was deleted from the card."),
        h("button", { class: "btn primary", onclick: () => { closeModal(); openPath(r.project); } }, "Open this project"));
    } catch (e) { put(out, h("div", { class: "banner" }, e.message)); ev.target.disabled = false; }
  };
  modal(
    h("div", { class: "modal-head" }, h("h3", {}, "Ingest a card"),
      h("p", {}, "Copies everything into a new project's _raw folder on the T7 and checks every copy. Nothing on the card is changed or deleted.")),
    h("div", { class: "modal-body" },
      !info.dest_ok ? h("div", { class: "banner" }, `The T7 isn't plugged in (${info.dest_root} not found).`) : null,
      h("div", { class: "field" }, h("label", {}, "From"), srcBox,
        h("div", { class: "inline" }, h("button", { class: "btn small", onclick: pick }, "Choose a folder…"), pathIn,
          h("button", { class: "btn small", onclick: usePath }, "Use path"))),
      h("div", { class: "field" }, h("label", {}, "New project name"), name,
        h("span", { class: "help" }, `Goes to ${info.dest_root}/<name>/_raw`)),
      out),
    h("div", { class: "modal-foot" }, h("button", { class: "btn", onclick: closeModal }, "Close"),
      h("button", { class: "btn primary", disabled: !info.dest_ok, onclick: start }, "Copy and verify")));
}

// ---------- fix + proxies ----------
async function openFixProxy() {
  let todo;
  try { todo = await api.get("/api/proxy/todo"); } catch (e) { return toast(e.message, true); }
  const out = h("div");
  const go = async (ev, fix, proxy) => {
    ev.target.disabled = true;
    const bar = progressBar();
    put(out, bar);
    try {
      const r = await runJob("/api/proxy/start", { fix, proxy }, bar.update);
      setView(await api.get("/api/project"));
      put(out, h("div", { class: "banner ok" }, `Done: ${r.done.length} file${r.done.length === 1 ? "" : "s"} made. Originals untouched.`),
        r.errors.length ? h("div", { class: "banner" }, ...r.errors.map((e) => h("div", {}, e))) : null,
        r.done.length ? opsTable(r.done.map((d) => ({ src: d.src, dst: d.out })), false) : null);
      renderMedia();
    } catch (e) { put(out, h("div", { class: "banner" }, e.message)); }
  };
  modal(
    h("div", { class: "modal-head" }, h("h3", {}, "Fix + proxies"),
      h("p", {}, "A clip that won't decode gets a clean H.264 copy next to it (name_fixed.mp4). Every video gets a 720p proxy in _proxies. Nothing is replaced or deleted.")),
    h("div", { class: "modal-body" },
      h("h4", {}, `Won't decode (${todo.fix.length})`),
      todo.fix.length ? h("table", { class: "ops" }, h("tbody", {}, ...todo.fix.map((x) => h("tr", {}, h("td", {}, x.path), h("td", { class: "flag" }, x.reason)))))
        : h("p", { class: "progress-text" }, "Every analyzed clip decodes cleanly."),
      h("h4", {}, `Need a proxy (${todo.proxy.length})`),
      todo.proxy.length ? opsTable(todo.proxy.map((x) => ({ src: x.path, dst: x.to })), false) : h("p", { class: "progress-text" }, "All proxies are made."),
      h("p", { class: "progress-text" }, "Tip: make proxies after Submit, so they carry the final names."),
      out),
    h("div", { class: "modal-foot" }, h("button", { class: "btn", onclick: closeModal }, "Close"),
      h("button", { class: "btn", disabled: !todo.fix.length, onclick: (e) => go(e, true, false) }, "Fix only"),
      h("button", { class: "btn primary", disabled: !todo.fix.length && !todo.proxy.length, onclick: (e) => go(e, true, true) }, "Fix + make proxies")));
}

// ---------- flub & silence map ----------
function openFlubMap() {
  const talk = S.view.cards.filter((c) => ["some", "lots"].includes(c.speech) && c.status !== "waiting" && c.status !== "analyzing"
    && !["music", "sound-effects"].includes(c.category));
  const out = h("div");
  const go = async (ev) => {
    ev.target.disabled = true;
    const bar = progressBar();
    put(out, bar);
    try {
      const r = await runJob("/api/flubs/start", {}, bar.update);
      setView(await api.get("/api/project"));
      put(out, h("div", { class: "banner ok" }, `Mapped ${r.mapped} clip${r.mapped === 1 ? "" : "s"}. Written into _footage-master.md (the previous version is kept in .blkgrlco-bin/history).`),
        r.errors.length ? h("div", { class: "banner" }, ...r.errors.map((e) => h("div", {}, e))) : null);
      renderMedia();
    } catch (e) { put(out, h("div", { class: "banner" }, e.message)); }
  };
  modal(
    h("div", { class: "modal-head" }, h("h3", {}, `Flub & silence map (${talk.length} clip${talk.length === 1 ? "" : "s"} with talking)`),
      h("p", {}, "Whisper listens to each clip with talking and marks your “lululu” / “la la la” flubs, silences over 0.7s, and repeated takes of the same line ranked by delivery.")),
    h("div", { class: "modal-body" },
      !S.view.whisper ? h("div", { class: "banner" }, "Whisper isn't installed, so this can't run. Run the start script again to install it.") : null,
      h("ul", {}, ...talk.slice(0, 30).map((c) => h("li", {}, c.name, " ", h("span", { class: "progress-text" }, c.duration || "")))),
      h("p", { class: "progress-text" }, "This transcribes every word, so it takes about a third of each clip's length on an M1."),
      out),
    h("div", { class: "modal-foot" }, h("button", { class: "btn", onclick: closeModal }, "Close"),
      h("button", { class: "btn primary", disabled: !talk.length || !S.view.whisper, onclick: go }, "Make the map")));
}

async function showFlubMap(c) {
  let r;
  try { r = await api.get(`/api/flubs/map?fid=${encodeURIComponent(c.fid)}`); } catch (e) { return toast(e.message, true); }
  const m = r.map;
  const events = [...m.flubs.map((f) => ({ t: f.t, end: f.end, what: f.kind === "marker" ? "flub marker" : "possible flub", detail: f.text, cls: f.kind })),
    ...m.silences.map(([a, b]) => ({ t: a, end: b, what: "silence", detail: `${(b - a).toFixed(1)}s`, cls: "silence" }))].sort((a, b) => a.t - b.t);
  const view = { sub: "events" };
  const body = h("div", { class: "modal-body" });
  const draw = () => put(body, 
    h("div", { class: "segmented small" }, ...[["events", `Flubs & silences (${events.length})`], ["takes", `Repeated takes (${m.takes.length})`], ["words", "Transcript"]].map(([k, l]) =>
      h("button", { class: view.sub === k ? "active" : "", onclick: () => { view.sub = k; draw(); } }, l))),
    view.sub === "events" ? h("table", { class: "ops" }, h("thead", {}, h("tr", {}, h("th", {}, "Time"), h("th", {}, "What"), h("th", {}, "Detail"))),
      h("tbody", {}, ...events.map((e) => h("tr", { class: `ev-${e.cls}` }, h("td", {}, `${fmtT(e.t)}–${fmtT(e.end)}`), h("td", {}, e.what), h("td", {}, e.detail)))))
    : view.sub === "takes" ? h("div", {}, ...(m.takes.length ? m.takes.map((g) => h("div", { class: "take-group" },
      h("b", {}, `“${g.line}”`),
      h("ol", {}, ...[...g.takes].sort((a, b) => a.rank - b.rank).map((t) => h("li", { class: t.rank === 1 ? "best" : "" },
        `${fmtT(t.start)}–${fmtT(t.end)} · score ${t.score} · ${t.notes}`))))) : [h("p", { class: "progress-text" }, "No line was said more than once.")]))
    : h("div", { class: "transcript" }, ...m.transcript.map((s) => h("p", {}, h("span", { class: "progress-text" }, fmtT(s.start) + "  "), s.text))));
  draw();
  modal(h("div", { class: "modal-head" }, h("h3", {}, r.name),
    h("p", {}, `Engine: ${m.engine}. Check it against what you actually said before cutting: Whisper sometimes hears a flub as a real word, or skips it (those show as “possible”).`)),
    body, h("div", { class: "modal-foot" }, h("button", { class: "btn primary", onclick: closeModal }, "Close")));
}

// ---------- LUT ----------
async function setLut(c, on) {
  try {
    await api.post("/api/file", { fid: c.fid, changes: { lut: on } });
    await analyze([c.fid], true);
    toast(on ? "LUT on. Re-analyzing this clip." : "LUT off for this clip. Re-analyzing.");
  } catch (e) { toast(e.message, true); }
}

function lutSettings() {
  const wrap = h("div", { class: "field lut-field" }, h("label", {}, "D-Log M → Rec.709 LUT"), h("p", { class: "progress-text" }, "Loading…"));
  api.get("/api/lut").then((st) => {
    const file = h("input", { type: "file", accept: ".cube" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        try { await api.post("/api/lut", { name: f.name, text }); }
        catch (e) {
          if (e.status !== 422 || !confirm(`${e.message}\n\nUse it anyway?`)) throw e;
          await api.post("/api/lut", { name: f.name, text, force: true });
        }
        toast("LUT saved. Re-analyze DJI clips to see their frames in normal color."); renderSettings();
      } catch (e) { toast(e.message, true); }
    });
    put(wrap, h("label", {}, "D-Log M → Rec.709 LUT"),
      st.installed ? h("div", { class: "state-line" }, h("span", { class: "ok" }, "✓"), h("b", {}, st.name), h("span", { class: "progress-text" }, `${st.size}³ · ${st.title || ""}`))
        : h("div", { class: "state-line" }, h("span", { class: "off" }, "Not added yet:"), "DJI frames stay flat and grey until you add it."),
      h("span", { class: "help" }, "Choose DJI's “DJI OSMO Pocket 3 D-Log M to Rec.709” .cube file (from DJI's Pocket 3 downloads page). It's applied to the preview frames of every DJI clip before Claude looks at them. Your clips are never changed. A clip shot in normal color can be switched off on its card."),
      h("div", { class: "inline" }, file));
  }).catch((e) => put(wrap, h("label", {}, "LUT"), h("p", {}, e.message)));
  return wrap;
}
