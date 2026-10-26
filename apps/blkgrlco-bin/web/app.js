"use strict";

// ---------- tiny helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const api = {
  async get(path) {
    const r = await fetch(path);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
    return data;
  },
  async post(path, body = {}) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bin": "1" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
    return data;
  },
};

let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), isError ? 6000 : 3200);
}

const STATUS_LABEL = {
  waiting: "Waiting", analyzing: "Analyzing", included: "Included",
  saved: "Saved", skipped: "Skipped", error: "Error",
};

// ---------- app state ----------
const S = {
  status: null,
  settings: null,
  view: null,
  kind: "all",
  cat: "all",
  page: 0,
  pageSize: 12,
  settingsTab: "categories",
  draftCats: null,
  pollTimer: null,
};

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => showTab(b.dataset.tab)));

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  try { localStorage.setItem("bin.tab", name); } catch (e) { /* storage blocked */ }
  if (name === "media") renderMedia();
  if (name === "settings") renderSettings();
  if (name === "plan") renderPlan();
}

// ---------- project ----------
$("#pick-btn").addEventListener("click", pickFolder);

async function pickFolder() {
  if (S.status && !S.status.native_picker) {
    showTab("media");
    S.view = null;
    renderMedia(true);
    return;
  }
  try {
    toast("Opening the folder picker…");
    const v = await api.post("/api/project/pick");
    if (v.cancelled) return toast("No folder picked.");
    setView(v);
    S.page = 0;
    showTab("media");
  } catch (e) { toast(e.message, true); }
}

async function openPath(path) {
  try {
    setView(await api.post("/api/project/open", { path }));
    S.page = 0; S.cat = "all"; S.kind = "all";
    renderMedia();
  } catch (e) { toast(e.message, true); }
}

function setView(v) {
  S.view = v;
  const name = $("#project-name");
  name.textContent = v ? v.name : "No project open";
  name.title = v ? v.path : "";
  schedulePoll();
}

function isBusy(v) {
  return !!v && v.cards.some((c) => c.status === "analyzing" || c.queued);
}

function schedulePoll() {
  clearTimeout(S.pollTimer);
  if (!isBusy(S.view)) return;
  S.pollTimer = setTimeout(async () => {
    try {
      S.view = await api.get("/api/project");
      const focused = document.activeElement && document.activeElement.closest(".grid");
      if (!focused) renderMedia();
    } catch (e) { /* server restarting; try again */ }
    schedulePoll();
  }, 1200);
}

// ---------- media tab ----------
function filtered() {
  if (!S.view) return [];
  return S.view.cards.filter((c) =>
    (S.kind === "all" || c.kind === S.kind) &&
    (S.cat === "all" || (S.cat === "_none" ? !c.category : c.category === S.cat)));
}

function renderMedia(forcePathInput = false) {
  const root = $("#tab-media");
  root.innerHTML = "";
  if (!S.view) {
    root.append(emptyState(forcePathInput));
    return;
  }
  const cards = S.view.cards;
  const ofKind = cards.filter((c) => S.kind === "all" || c.kind === S.kind);
  const waiting = cards.filter((c) => c.status === "waiting" && !c.queued).length;
  const analyzing = cards.filter((c) => c.status === "analyzing").length;
  const included = cards.filter((c) => c.status === "included").length;
  const done = cards.filter((c) => !["waiting", "analyzing"].includes(c.status)).length;

  const kindSeg = h("div", { class: "segmented" },
    ...[["all", "All"], ["video", "Video"], ["audio", "Audio"], ["photo", "Photos"]].map(([k, label]) =>
      h("button", { class: S.kind === k ? "active" : "", onclick: () => { S.kind = k; S.page = 0; renderMedia(); } }, label)));

  const chip = (id, label, count, color) => h("button", {
    class: "chip" + (S.cat === id ? " active" : ""),
    onclick: () => { S.cat = id; S.page = 0; renderMedia(); },
  }, color ? h("span", { class: "dot", style: { background: color } }) : null, label, h("span", { class: "count" }, count));

  const cats = S.settings.categories;
  const unsorted = ofKind.filter((c) => !c.category).length;
  const chips = h("div", { class: "chips" },
    chip("all", "All", ofKind.length),
    ...cats.map((c) => chip(c.id, c.name, ofKind.filter((x) => x.category === c.id).length, c.color)),
    unsorted ? chip("_none", "Not analyzed", unsorted) : null);

  const off = [];
  if (!S.view.claude) off.push("Claude off: categories use simple rules (add your API key in Settings → Connections)");
  if (!S.view.whisper) off.push("Whisper not installed: speech is an audio-level estimate");
  const engines = off.length ? h("button", {
    class: "engine-note", title: off.join("\n"),
    onclick: () => { S.settingsTab = S.view.claude ? "analysis" : "connections"; showTab("settings"); },
  }, h("b", {}, "⚠ ", [!S.view.claude && "Claude off", !S.view.whisper && "Whisper off"].filter(Boolean).join(" · "))) : null;

  root.append(
    h("div", { class: "toolbar" },
      h("div", { class: "toolbar-row" },
        kindSeg, chips),
      h("div", { class: "toolbar-row" },
        h("button", { class: "btn", disabled: waiting === 0, onclick: analyzeAll },
          waiting ? `Analyze all (${waiting})` : "Analyze all"),
        h("span", { class: "progress-text" },
          isBusy(S.view) ? `Analyzing… ${done} of ${cards.length} done` : `${cards.length} files`),
        engines,
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", onclick: refresh, title: "Rescan the folder" }, "Rescan"),
        h("button", { class: "btn", disabled: !S.view.undo_available, onclick: confirmUndo },
          S.view.undo_available ? `Undo last submit (${S.view.undo_count})` : "Undo last submit"),
        h("button", { class: "btn primary", disabled: included === 0 || analyzing > 0, onclick: openDryRun },
          `Submit changes (${included})`))),
  );

  const wrap = h("div", { class: "grid-wrap" });
  const grid = h("div", { class: "grid" });
  wrap.append(grid);
  root.append(wrap);
  const pager = h("div", { class: "pager" });
  root.append(pager);

  // fit as many cards as the window shows, then page: no long scrolling
  requestAnimationFrame(() => {
    const W = wrap.clientWidth - 40, H = wrap.clientHeight - 4, gap = 14;
    const cols = Math.max(1, Math.floor((W + gap) / (268 + gap)));
    const rows = Math.max(1, Math.floor((H + gap) / (296 + gap)));
    S.pageSize = cols * rows;
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / S.pageSize));
    S.page = Math.min(S.page, pages - 1);
    const slice = list.slice(S.page * S.pageSize, (S.page + 1) * S.pageSize);
    grid.replaceChildren(...slice.map(card));
    if (!list.length) grid.append(h("div", { class: "progress-text" }, "Nothing here with these filters."));
    pager.replaceChildren(
      h("button", { class: "btn small", disabled: S.page === 0, onclick: () => { S.page--; renderMedia(); } }, "‹ Prev"),
      h("span", { class: "page-label" }, `Page ${S.page + 1} of ${pages}`),
      h("button", { class: "btn small", disabled: S.page >= pages - 1, onclick: () => { S.page++; renderMedia(); } }, "Next ›"));
  });
}

function emptyState(forcePathInput) {
  const recent = (S.settings && S.settings.recent_projects) || [];
  const pathInput = h("input", { placeholder: "/Volumes/Untitled/project hhh/<video folder>", value: recent[0] || "" });
  const nativeOk = S.status && S.status.native_picker && !forcePathInput;
  return h("div", { class: "empty-state" },
    h("h2", {}, "Open a video's folder"),
    h("p", {}, "Pick one subfolder of “project hhh” on your T7. Nothing changes until you review a dry run and confirm."),
    nativeOk ? h("button", { class: "btn primary", onclick: pickFolder }, "Pick folder…") : null,
    h("div", { class: "path-row" }, pathInput,
      h("button", { class: "btn", onclick: () => openPath(pathInput.value.trim()) }, "Open path")),
    recent.length ? h("div", { class: "recent" },
      h("p", {}, "Recent"),
      ...recent.slice(0, 5).map((p) => h("button", { title: p, onclick: () => openPath(p) }, p))) : null);
}

function card(c) {
  const color = c.color || "#B4AD7F";
  const frames = c.frames || [];
  let thumbs;
  if (c.kind === "video" && frames.length) {
    const pick = frames.length >= 3 ? [frames[0], frames[2]] : frames.slice(0, 2);
    thumbs = h("div", { class: "thumbs" }, ...pick.map((f) => h("img", { src: `/api/frame/${f}`, alt: "", loading: "lazy" })));
  } else if (frames.length) {
    thumbs = h("div", { class: "thumbs single" }, h("img", { src: `/api/frame/${frames[0]}`, alt: "", loading: "lazy" }));
  } else {
    thumbs = h("div", { class: "thumbs single" }, h("div", { class: "empty" },
      c.status === "analyzing" ? "Pulling frames…" : "Not analyzed yet"));
  }

  const newName = c.proposed_name
    ? h("span", { title: c.proposed_path }, c.proposed_name)
    : h("span", { class: "pending" }, "new name after analysis");
  const editBtn = c.proposed_name && c.status !== "analyzing"
    ? h("button", { class: "edit", title: "Edit the title part of the name", onclick: (ev) => editTitle(ev, c) }, "✎")
    : null;

  const meta = h("div", { class: "meta" },
    h("span", { class: "tag kind" }, c.kind),
    c.duration && c.duration !== "—" ? h("span", { class: "tag" }, c.duration) : null,
    h("span", { class: "tag" }, c.size),
    c.device ? h("span", { class: "tag" }, c.device) : null,
    c.orientation ? h("span", { class: "tag" }, c.orientation) : null,
    c.speech ? h("span", { class: `tag speech-${c.speech}`, title: `${Math.round((c.speech_ratio || 0) * 100)}% talking · ${c.speech_engine || ""}` },
      `speech: ${c.speech}`) : null);

  const select = h("select", {
    class: "cat-select", title: c.source ? `Picked by ${c.source === "user" ? "you" : c.source}` : "",
    disabled: c.status === "analyzing" || c.status === "waiting",
    onchange: (ev) => updateFile(c.fid, { category: ev.target.value }),
  },
    !c.category ? h("option", { value: "" }, "Category…") : null,
    ...S.settings.categories.map((cat) => h("option", { value: cat.id, selected: cat.id === c.category }, cat.name)));

  const desc = c.error ? `⚠ ${c.error}` : (c.description || c.note || (c.status === "saved" ? "" : ""));

  return h("article", { class: "card", style: { "--cat": color } },
    thumbs,
    h("div", { class: "card-body" },
      h("div", { class: "names" },
        h("div", { class: "old", title: c.path }, c.status === "saved" && c.original_name !== c.name ? `was ${c.original_name}` : c.name),
        h("div", { class: "new" }, h("span", { class: "arrow" }, "→"), newName, editBtn)),
      meta,
      desc ? h("div", { class: "desc", title: desc }, desc) : null),
    h("div", { class: "card-foot", style: { "--cat": c.category ? color : null } },
      h("span", { class: `status ${c.status}` }, c.queued ? "Waiting…" : STATUS_LABEL[c.status] || c.status),
      select,
      h("button", { class: "icon-btn", title: "Re-analyze", disabled: c.status === "analyzing",
        onclick: () => analyze([c.fid], true) }, "↻"),
      h("label", { class: "include", title: "Include in the next submit" },
        h("input", { type: "checkbox", checked: c.include, disabled: c.status === "saved",
          onchange: (ev) => updateFile(c.fid, { include: ev.target.checked }) }))));
}

function editTitle(ev, c) {
  const wrapEl = ev.target.closest(".new");
  const input = h("input", { class: "input", value: (c.title || "").replace(/-/g, " "), style: { padding: "2px 6px", width: "100%" } });
  wrapEl.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (save) await updateFile(c.fid, { title: input.value });
    else renderMedia();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

async function updateFile(fid, changes) {
  try {
    setView(await api.post("/api/file", { fid, changes }));
    renderMedia();
  } catch (e) { toast(e.message, true); }
}

async function analyze(fids, force) {
  try {
    const r = await api.post("/api/analyze", { fids, force });
    if (!r.queued) return toast("Nothing to analyze.");
    setView(await api.get("/api/project"));
    renderMedia();
  } catch (e) { toast(e.message, true); }
}

const analyzeAll = () => analyze(null, false);

async function refresh() {
  try { setView(await api.post("/api/project/refresh")); renderMedia(); toast("Folder rescanned."); }
  catch (e) { toast(e.message, true); }
}

// ---------- submit: dry run, apply, undo ----------
function modal(...content) {
  const m = $("#modal");
  m.querySelector(".modal-box").replaceChildren(...content);
  m.classList.remove("hidden");
}
const closeModal = () => $("#modal").classList.add("hidden");
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function opsTable(ops, showFlags = true) {
  return h("table", { class: "ops" },
    h("thead", {}, h("tr", {}, h("th", {}, "Now"), h("th", {}), h("th", {}, "After"), showFlags ? h("th", {}) : null)),
    h("tbody", {}, ...ops.map((op) => h("tr", {},
      h("td", {}, op.src), h("td", { class: "arrow" }, "→"), h("td", {}, op.dst),
      showFlags ? h("td", { class: "flag" }, op.suffixed ? "name taken: added -2" : "") : null))));
}

async function openDryRun() {
  let plan;
  try { plan = await api.post("/api/submit/plan"); } catch (e) { return toast(e.message, true); }
  if (!plan.ops.length) return toast("Nothing to change.");
  const folders = [...new Set(plan.ops.map((o) => o.dst.split("/").slice(0, -1).join("/")).filter(Boolean))];
  modal(
    h("div", { class: "modal-head" },
      h("h3", {}, `Dry run: ${plan.ops.length} rename${plan.ops.length === 1 ? "" : "s"} + move${plan.ops.length === 1 ? "" : "s"}`),
      h("p", {}, "Nothing has changed yet. Check every line, then apply."),
      h("div", { class: "banner" },
        `Files move into: ${folders.join(", ")}. `,
        "No file is deleted or overwritten. Each move is logged to _bin-log.csv and _footage-master.md is updated.")),
    h("div", { class: "modal-body" }, opsTable(plan.ops),
      plan.skipped.length ? h("p", { class: "progress-text" }, `${plan.skipped.length} file(s) left out because they aren't analyzed yet.`) : null),
    h("div", { class: "modal-foot" },
      h("button", { class: "btn", onclick: closeModal }, "Cancel"),
      h("button", { class: "btn primary", onclick: (ev) => applyPlan(ev, plan) }, `Apply ${plan.ops.length} change${plan.ops.length === 1 ? "" : "s"}`)));
}

async function applyPlan(ev, plan) {
  ev.target.disabled = true;
  ev.target.textContent = "Applying…";
  try {
    const r = await api.post("/api/submit/apply", { plan_id: plan.plan_id });
    setView(r.view);
    modal(
      h("div", { class: "modal-head" },
        h("h3", {}, `Done: ${r.applied} file${r.applied === 1 ? "" : "s"} renamed and moved`),
        h("p", {}, "Logged to _bin-log.csv. _footage-master.md is updated. You can undo this from the Media tab.")),
      h("div", { class: "modal-body" },
        r.errors.length ? h("div", { class: "banner" }, ...r.errors.map((e) => h("div", {}, e))) : null,
        opsTable(r.ops, false)),
      h("div", { class: "modal-foot" }, h("button", { class: "btn primary", onclick: closeModal }, "Close")));
    renderMedia();
  } catch (e) {
    closeModal();
    toast(e.message, true);
  }
}

function confirmUndo() {
  modal(
    h("div", { class: "modal-head" },
      h("h3", {}, `Undo the last submit (${S.view.undo_count} file${S.view.undo_count === 1 ? "" : "s"})?`),
      h("p", {}, "Every file goes back to its old name and folder. Folders the submit created are removed if they're empty. Nothing is deleted or overwritten.")),
    h("div", { class: "modal-foot" },
      h("button", { class: "btn", onclick: closeModal }, "Cancel"),
      h("button", { class: "btn primary", onclick: runUndo }, "Undo it")));
}

async function runUndo(ev) {
  ev.target.disabled = true;
  try {
    const r = await api.post("/api/submit/undo");
    setView(r.view);
    modal(
      h("div", { class: "modal-head" },
        h("h3", {}, `Restored ${r.restored} file${r.restored === 1 ? "" : "s"}`),
        h("p", {}, "Each move back is logged to _bin-log.csv.")),
      h("div", { class: "modal-body" },
        r.conflicts.length ? h("div", { class: "banner" }, h("b", {}, "Left alone: "), ...r.conflicts.map((c) => h("div", {}, c))) : null,
        r.folders_kept.length ? h("div", { class: "banner" }, `Kept (not empty): ${r.folders_kept.join(", ")}`) : null,
        opsTable(r.ops.map((o) => ({ src: o.dst, dst: o.src })), false)),
      h("div", { class: "modal-foot" }, h("button", { class: "btn primary", onclick: closeModal }, "Close")));
    renderMedia();
  } catch (e) { closeModal(); toast(e.message, true); }
}

// ---------- settings ----------
function renderSettings() {
  const root = $("#tab-settings");
  const tabs = [["categories", "Categories"], ["names", "File names"], ["analysis", "Analysis"], ["connections", "Connections"]];
  const body = h("div", { class: "subpanel" });
  root.replaceChildren(h("div", { class: "settings" },
    h("nav", { class: "subtabs" }, ...tabs.map(([id, label]) =>
      h("button", { class: S.settingsTab === id ? "active" : "", onclick: () => { S.settingsTab = id; renderSettings(); } }, label))),
    body));
  ({ categories: settingsCategories, names: settingsNames, analysis: settingsAnalysis, connections: settingsConnections })[S.settingsTab](body);
}

async function saveSettings(patch, msg = "Saved.") {
  try {
    const saved = await api.post("/api/settings", patch);
    S.settings = { ...S.settings, ...saved };
    toast(msg);
    if (S.view) setView(await api.get("/api/project"));
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

function settingsCategories(body) {
  if (!S.draftCats) S.draftCats = JSON.parse(JSON.stringify(S.settings.categories));
  const rows = h("div", { class: "cat-rows" });
  const draw = () => rows.replaceChildren(
    h("div", { class: "cat-row progress-text" }, h("span", {}, "Color"), h("span", {}, "Name (= folder name)"), h("span", {}, "What belongs here (Claude reads this)")),
    ...S.draftCats.map((c) => {
      const sw = h("button", { class: "swatch", style: { background: c.color }, title: "Change color" });
      sw.addEventListener("click", (ev) => {
        ev.stopPropagation();
        document.querySelectorAll(".palette-pop").forEach((p) => p.remove());
        const custom = h("input", { type: "color", value: c.color, title: "Custom color",
          oninput: (e) => { c.color = e.target.value; sw.style.background = c.color; } });
        const pop = h("div", { class: "palette-pop" },
          ...S.settings.palette.map((col) => h("button", { style: { background: col }, title: col,
            onclick: (e) => { e.stopPropagation(); c.color = col; draw(); } })), custom);
        sw.append(pop);
      });
      return h("div", { class: "cat-row" }, sw,
        h("input", { class: "input", value: c.name, oninput: (e) => { c.name = e.target.value; } }),
        h("input", { class: "input", value: c.hint || "", oninput: (e) => { c.hint = e.target.value; } }));
    }));
  draw();
  document.addEventListener("click", () => document.querySelectorAll(".palette-pop").forEach((p) => p.remove()), { once: true });
  body.append(
    h("h3", {}, "Categories"),
    h("p", { class: "lead" }, "Rename, recolor or add categories. Renaming one changes the folder name on your next submit (you'll see it in the dry run)."),
    rows,
    h("div", { class: "row-actions" },
      h("button", { class: "btn", onclick: () => {
        S.draftCats.push({ id: "", name: `New category ${S.draftCats.length + 1}`, color: S.settings.palette[S.draftCats.length % 9], hint: "" });
        draw();
      } }, "+ Add category"),
      h("button", { class: "btn", onclick: () => { S.draftCats = null; renderSettings(); } }, "Discard changes"),
      h("button", { class: "btn primary", onclick: async () => {
        if (await saveSettings({ categories: S.draftCats }, "Categories saved.")) { S.draftCats = null; renderSettings(); }
      } }, "Save categories")));
}

function settingsNames(body) {
  const sample = { date: "2026-10-11", category: "talking-head", title: "desk-intro", project: "desk-vlog", seq: "001", original: "DJI_20261011101233_0001_D" };
  const labels = {
    date_category_title: "Date + title (default)",
    date_title: "Date + title, no category",
    date_category_seq: "Date + category + number",
    project_date_title: "Project + date + title",
    keep: "Keep the original name (only move)",
  };
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => sample[k]) + (tpl === "{original}" ? ".MP4" : ".mp4");
  body.append(
    h("h3", {}, "File name format"),
    h("p", { class: "lead" }, "How proposed names are built. The date comes from the DJI file name or the camera's metadata."),
    h("div", { class: "formats" }, ...Object.entries(S.settings.name_formats).map(([id, tpl]) =>
      h("label", { class: "format" },
        h("input", { type: "radio", name: "fmt", checked: S.settings.name_format === id,
          onchange: () => saveSettings({ name_format: id }, "Name format saved.") }),
        h("span", { class: "label" }, labels[id] || id),
        h("code", {}, fill(tpl))))));
}

function settingsAnalysis(body) {
  const th = S.settings.speech_thresholds;
  const some = h("input", { class: "input", type: "number", min: 1, max: 90, value: Math.round(th.some * 100), style: { width: "80px" } });
  const lots = h("input", { class: "input", type: "number", min: 5, max: 100, value: Math.round(th.lots * 100), style: { width: "80px" } });
  const model = h("select", { class: "input" }, ...["tiny", "base", "small", "medium"].map((m) =>
    h("option", { value: m, selected: S.settings.whisper_model === m }, m)));
  const claudeModel = h("input", { class: "input", value: S.settings.claude_model });
  body.append(
    h("h3", {}, "Analysis"),
    h("p", { class: "lead" }, "How speech is measured and which models run."),
    h("div", { class: "state-line" }, "Whisper (local speech detection):",
      S.status.whisper ? h("span", { class: "ok" }, "installed") : h("span", { class: "off" }, "not installed: run the start script again to install it")),
    h("div", { class: "field" }, h("label", {}, "Speech levels"),
      h("div", { class: "inline" }, "“some” from", some, "% of the clip, “lots” from", lots, "%")),
    h("div", { class: "field" }, h("label", {}, "Whisper model"), model,
      h("span", { class: "help" }, "small is a good balance on an M1. medium is slower but catches more.")),
    h("div", { class: "field" }, h("label", {}, "Claude model"), claudeModel),
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => saveSettings({
      speech_thresholds: { some: Number(some.value) / 100, lots: Number(lots.value) / 100 },
      whisper_model: model.value, claude_model: claudeModel.value.trim() || "claude-opus-5-5",
    }, "Analysis settings saved.") }, "Save")));
}

function settingsConnections(body) {
  const exportPath = h("input", { class: "input", value: S.settings.export_path || "", placeholder: "~/BLKGRLCO Studios/bin-export.json", style: { flex: 1 } });
  const key = h("input", { class: "input", type: "password", placeholder: S.status.api_key_set ? "•••••••• saved" : "sk-ant-…", style: { flex: 1 } });
  body.append(
    h("h3", {}, "Connections"),
    h("p", { class: "lead" }, "Keys stay on this Mac, in the app's own folder. They never go into the repo or onto the T7."),
    h("div", { class: "field" }, h("label", {}, "Anthropic API key (Claude vision)"),
      h("div", { class: "inline" }, key,
        h("button", { class: "btn primary", onclick: async () => {
          try {
            const r = await api.post("/api/api-key", { key: key.value });
            S.status.api_key_set = r.api_key_set; S.status.claude = r.claude;
            toast(r.api_key_set ? "Key saved." : "Key removed.");
            if (S.view) setView(await api.get("/api/project"));
            renderSettings();
          } catch (e) { toast(e.message, true); }
        } }, "Save key")),
      h("span", { class: "help" }, S.status.claude ? "Claude is on." :
        S.status.api_key_set ? "Key saved, but the anthropic package isn't installed: run the start script again." :
        "Get a key at console.anthropic.com → API keys.")),
    h("div", { class: "field" }, h("label", {}, "BLKGRLCO Studios dashboard"),
      h("span", { class: "help" }, "Every time you tick a title (or change a video's details), the app rewrites this file. On the dashboard, open Data → Imports & Code → Import from BLKGRLCO Bin and choose it. You see a preview before anything changes."),
      h("div", { class: "inline" }, exportPath,
        h("button", { class: "btn", onclick: () => saveSettings({ export_path: exportPath.value.trim() }, "Export location saved.") }, "Save"))),
    h("div", { class: "field" }, h("label", {}, "YouTube Analytics"), h("span", { class: "help" }, "Connected in Phase 3.")));
}

// ---------- boot ----------
window.addEventListener("resize", () => { if ($("#tab-media").classList.contains("active")) renderMedia(); });

(async function boot() {
  try {
    [S.status, S.settings] = await Promise.all([api.get("/api/status"), api.get("/api/settings")]);
  } catch (e) {
    return toast("Can't reach the BLKGRLCO Bin server. Is it running?", true);
  }
  if (S.status.project) {
    try { setView(await api.get("/api/project")); } catch (e) { /* none open */ }
  }
  let tab = "media";
  try { tab = localStorage.getItem("bin.tab") || "media"; } catch (e) { /* storage blocked */ }
  showTab(["media", "plan", "overview", "settings"].includes(tab) ? tab : "media");
})();
