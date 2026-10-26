"use strict";
/* Project sidebar, the Overview tab (channel analytics + ideas box), and YouTube setup.
   Uses h(), api, toast, S, $ from app.js. */

const O = { projects: [], current: null, sort: "type", sub: "channels", yt: null, channel: null, days: 28,
  metric: "views", data: null, table: false, ideaDraft: "", meta: null };

const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const METRICS = {
  views: { label: "Views", fmt: fmtInt },
  watch_hours: { label: "Watch hours", fmt: (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 }) },
  subscribers: { label: "Subscribers (net)", fmt: (n) => (n > 0 ? "+" : "") + fmtInt(n) },
  earnings: { label: "Earnings", fmt: (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
};
const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ---------- sidebar ----------
async function loadProjects() {
  try {
    const r = await api.get("/api/projects");
    O.projects = r.projects; O.current = r.current; O.meta = r;
  } catch (e) { /* server restarting */ }
  drawSidebar(); updateHeader();
}

function currentPlan() { return O.projects.find((p) => p.id === O.current) || null; }

function updateHeader() {
  const p = currentPlan(), el = $("#project-name");
  if (p) { el.textContent = p.name; el.title = p.folder || "No footage folder yet"; }
  else if (S.view) { el.textContent = S.view.name; el.title = S.view.path; }
  else { el.textContent = "No project open"; el.title = ""; }
}

function sortProjects(list) {
  const fmtOrder = (O.meta?.formats || []);
  const by = {
    type: (a, b) => fmtOrder.indexOf(a.format) - fmtOrder.indexOf(b.format) || a.name.localeCompare(b.name),
    date: (a, b) => (a.post_date || "9999").localeCompare(b.post_date || "9999") || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  }[O.sort];
  return [...list].sort(by);
}

function drawSidebar() {
  const side = $("#sidebar");
  if (!side) return;
  const groups = [["in-progress", "In progress", true], ["not-started", "Not started", true], ["posted", "Posted", false]];
  let lastType = null;
  const item = (p) => {
    const showType = O.sort === "type" && p.format !== lastType;
    lastType = p.format;
    return [
      showType ? h("div", { class: "side-type" }, p.format) : null,
      h("button", { class: "side-item" + (p.id === O.current ? " active" : ""), title: p.folder || "No footage folder yet",
        onclick: () => selectProject(p.id) },
        h("span", { class: "side-name" }, p.name),
        h("span", { class: "side-meta" },
          [O.meta?.channels?.[p.channel] && p.channel !== "@blkgrlco" ? p.channel : null, p.post_date ? shortDate(p.post_date) : null,
            !p.folder ? "idea · no footage yet" : !p.folder_ok ? "T7 not connected" : null,
            p.titles.long_form && !p.titles.ok ? `titles ${p.titles.written}/3` : null].filter(Boolean).join(" · ")))];
  };
  const visible = O.projects.filter((p) => !p.test_copy);
  side.replaceChildren(
    h("div", { class: "side-head" },
      h("b", {}, "Projects"),
      h("select", { class: "side-sort", title: "Sort", onchange: (e) => { O.sort = e.target.value; saveUi(); drawSidebar(); } },
        ...[["type", "By type"], ["date", "By post date"], ["name", "By name"]].map(([k, l]) => h("option", { value: k, selected: O.sort === k }, l)))),
    h("div", { class: "side-list" },
      ...groups.map(([status, label, open]) => {
        const list = sortProjects(visible.filter((p) => p.status === status));
        lastType = null;
        return h("details", { class: "side-group", open: open || list.some((p) => p.id === O.current) },
          h("summary", {}, label, h("span", { class: "count" }, String(list.length))),
          ...(list.length ? list.flatMap(item) : [h("p", { class: "side-empty" }, status === "not-started" ? "Add ideas in Overview → Ideas." : "None yet.")]));
      })),
    h("button", { class: "btn small side-add", onclick: () => { O.sub = "ideas"; showTab("overview"); } }, "+ Add ideas"));
}

async function selectProject(id) {
  try {
    const r = await api.post("/api/projects/select", { id });
    O.projects = r.projects; O.current = r.current;
    S.view = r.media_open ? await api.get("/api/project") : null;
    S.page = 0; S.cat = "all"; S.kind = "all";
    drawSidebar(); updateHeader(); schedulePoll();
    const tab = document.querySelector(".tabs button.active")?.dataset.tab || "media";
    showTab(tab === "overview" || tab === "settings" ? "plan" : tab);
  } catch (e) { toast(e.message, true); }
}

async function linkFolder(path) {
  try {
    const r = await api.post("/api/projects/link-folder", path ? { path } : {});
    if (r.cancelled) return toast("No folder picked.");
    O.projects = r.projects; O.current = r.current;
    S.view = r.media_open ? await api.get("/api/project") : null;
    drawSidebar(); updateHeader(); renderMedia();
    toast("Folder linked. Its footage is in the Media tab now.");
  } catch (e) { toast(e.message, true); }
}

function saveUi() { try { localStorage.setItem("bin.sort", O.sort); } catch (e) { /* storage blocked */ } }
try { O.sort = localStorage.getItem("bin.sort") || "type"; } catch (e) { /* storage blocked */ }

// ---------- overview tab ----------
async function renderOverview() {
  const root = $("#tab-overview");
  const subs = [["channels", "Channels"], ["ideas", "Ideas"]];
  const body = h("div", { class: "subpanel" });
  root.replaceChildren(h("div", { class: "settings" },
    h("nav", { class: "subtabs" }, ...subs.map(([id, l]) =>
      h("button", { class: O.sub === id ? "active" : "", onclick: () => { O.sub = id; renderOverview(); } }, l))),
    body));
  if (O.sub === "ideas") return drawIdeas(body);
  body.append(h("p", { class: "progress-text" }, "Loading…"));
  try { O.yt = await api.get("/api/youtube/status"); } catch (e) { body.replaceChildren(h("p", {}, e.message)); return; }
  drawChannels(body);
}

function drawChannels(body) {
  const yt = O.yt;
  if (!yt.channels.length) {
    body.replaceChildren(
      h("h3", {}, "Channel analytics"),
      h("p", { class: "lead" }, "Views, subscribers, watch hours and earnings (if your channel has them), straight from YouTube Analytics."),
      h("div", { class: "banner" }, yt.client ? "Your Google app is set up. Connect a channel to see its numbers."
        : "First connect YouTube: it's a one-time setup in Settings → Connections (about 10 minutes)."),
      h("button", { class: "btn primary", onclick: () => { S.settingsTab = "connections"; showTab("settings"); } },
        yt.client ? "Connect a channel" : "Set up YouTube"));
    return;
  }
  if (!yt.channels.some((c) => c.id === O.channel)) O.channel = yt.channels[0].id;
  const head = h("div", { class: "row-head" },
    h("div", { class: "toolbar-row" },
      h("div", { class: "chips" }, ...yt.channels.map((c) =>
        h("button", { class: "chip" + (c.id === O.channel ? " active" : ""), onclick: () => { O.channel = c.id; O.data = null; drawChannels(body); } },
          c.handle || c.title))),
      h("div", { class: "segmented" }, ...[[7, "7 days"], [28, "28 days"]].map(([d, l]) =>
        h("button", { class: O.days === d ? "active" : "", onclick: () => { O.days = d; O.data = null; drawChannels(body); } }, l)))),
    h("label", { class: "inline progress-text" }, h("input", { type: "checkbox", checked: O.table, onchange: (e) => { O.table = e.target.checked; drawChannels(body); } }), "Show as table"));
  const area = h("div", { class: "analytics" }, h("p", { class: "progress-text" }, "Loading YouTube Analytics…"));
  body.replaceChildren(head, area);
  const want = `${O.channel}:${O.days}`;
  if (O.data && O.data.key === want) return drawAnalytics(area);
  api.get(`/api/youtube/overview?channel=${encodeURIComponent(O.channel)}&days=${O.days}`)
    .then((d) => { O.data = { ...d, key: want }; drawAnalytics(area); })
    .catch((e) => area.replaceChildren(h("div", { class: "banner" }, e.message)));
}

function drawAnalytics(area) {
  const d = O.data, m = d.metrics;
  if (!m[O.metric]?.available) O.metric = "views";
  const tiles = Object.entries(METRICS).map(([k, def]) => {
    const x = m[k];
    if (!x || !x.available) {
      return h("div", { class: "tile off", title: x?.note || "" }, h("span", { class: "tile-label" }, def.label),
        h("b", { class: "tile-value" }, "—"), h("span", { class: "tile-note" }, "Not available for this channel"));
    }
    const ch = x.change;
    return h("button", { class: "tile" + (O.metric === k ? " active" : ""), onclick: () => { O.metric = k; drawAnalytics(area); } },
      h("span", { class: "tile-label" }, def.label),
      h("b", { class: "tile-value" }, def.fmt(x.total)),
      h("span", { class: "tile-note" },
        ch == null ? "no earlier data to compare" : `${ch >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(ch * 100))}% vs the ${d.days} days before`,
        k === "subscribers" && x.current_total != null ? ` · ${fmtInt(x.current_total)} total` : ""),
      sparkline(x.daily));
  });
  const x = m[O.metric], def = METRICS[O.metric];
  area.replaceChildren(
    h("div", { class: "tiles" }, ...tiles),
    h("div", { class: "chart-card" },
      h("div", { class: "chart-head" },
        h("b", {}, `${def.label} per day`),
        h("span", { class: "legend" },
          h("span", {}, h("i", { class: "key cur" }), `${shortDate(d.start)} – ${shortDate(d.end)}`),
          h("span", {}, h("i", { class: "key prev" }), `the ${d.days} days before`))),
      O.table ? dataTable(d, x, def) : lineChart(d, x, def),
      h("p", { class: "progress-text" }, `YouTube Analytics runs about 3 days behind, so this covers ${shortDate(d.start)} to ${shortDate(d.end)}. Click a tile to chart it.`)));
}

function sparkline(vals) {
  const W = 120, H = 28, max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "spark"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--berry)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function lineChart(d, x, def) {
  const W = 900, H = 260, L = 56, R = 16, T = 12, B = 28;
  const n = x.daily.length;
  const lo = Math.min(0, ...x.daily, ...x.previous_daily);
  const hi = niceMax(Math.max(...x.daily, ...x.previous_daily) * 1.05);
  const sx = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const sy = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const xlabels = d.dates.map((iso, i) => ({ i, iso })).filter(({ i }) => n <= 7 || i % 7 === 0 || i === n - 1);
  const wrap = h("div", { class: "chart-wrap" });
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${def.label} per day">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" class="grid"/>
      <text x="${L - 8}" y="${sy(t) + 4}" text-anchor="end" class="axis">${def.fmt(t)}</text>`).join("")}
    ${xlabels.map(({ i, iso }) => `<text x="${sx(i)}" y="${H - 8}" text-anchor="middle" class="axis">${shortDate(iso)}</text>`).join("")}
    <path d="${path(x.previous_daily)}" class="line prev"/>
    <path d="${path(x.daily)}" class="line cur"/>
    <line class="cross" y1="${T}" y2="${H - B}" x1="-10" x2="-10"/>
    <circle class="dot" r="5" cx="-10" cy="-10"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg><div class="tip hidden"></div>`;
  const svg = wrap.querySelector("svg"), tip = wrap.querySelector(".tip");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (W - L - R)) * (n - 1))));
    svg.querySelector(".cross").setAttribute("x1", sx(i)); svg.querySelector(".cross").setAttribute("x2", sx(i));
    const dot = svg.querySelector(".dot"); dot.setAttribute("cx", sx(i)); dot.setAttribute("cy", sy(x.daily[i]));
    tip.innerHTML = `<b>${shortDate(d.dates[i])}</b><br>${def.fmt(x.daily[i])}<br><span>${def.fmt(x.previous_daily[i])} the same day before</span>`;
    tip.classList.remove("hidden");
    const left = (sx(i) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 170, Math.max(0, left + 12))}px`;
    tip.style.top = `${(sy(x.daily[i]) / H) * r.height - 20}px`;
  };
  svg.addEventListener("mousemove", move);
  svg.addEventListener("mouseleave", () => { tip.classList.add("hidden"); svg.querySelector(".cross").setAttribute("x1", -10); svg.querySelector(".cross").setAttribute("x2", -10); svg.querySelector(".dot").setAttribute("cx", -10); });
  return wrap;
}

function dataTable(d, x, def) {
  return h("div", { class: "table-wrap" }, h("table", { class: "ops" },
    h("thead", {}, h("tr", {}, h("th", {}, "Day"), h("th", {}, def.label), h("th", {}, "Same day, period before"))),
    h("tbody", {}, ...d.dates.map((iso, i) => h("tr", {}, h("td", {}, shortDate(iso)), h("td", {}, def.fmt(x.daily[i])), h("td", {}, def.fmt(x.previous_daily[i])))))));
}

// ---------- ideas ----------
function drawIdeas(body) {
  const channels = O.meta?.channels || { "@blkgrlco": "@blkgrlco" };
  const formats = O.meta?.formats || ["long-form"];
  const box = h("textarea", { class: "input ideas-box", rows: 9, placeholder: "One idea per line. Paste a whole list if you like." });
  box.value = O.ideaDraft;
  box.addEventListener("input", () => { O.ideaDraft = box.value; });
  const channel = h("select", { class: "input" }, ...Object.entries(channels).map(([k, l]) => h("option", { value: k }, l)));
  const format = h("select", { class: "input" }, ...formats.map((f) => h("option", { value: f }, f)));
  const shotInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "hidden" });
  const status = h("span", { class: "progress-text" });
  const readShot = async (file) => {
    if (!file || !/image\//.test(file.type)) return toast("Drop a screenshot (PNG or JPG).", true);
    status.textContent = "Reading the screenshot…";
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const r = await api.post("/api/ideas/screenshot", { data });
      O.ideaDraft = [O.ideaDraft.trim(), ...r.ideas].filter(Boolean).join("\n");
      box.value = O.ideaDraft;
      status.textContent = `Found ${r.ideas.length} idea${r.ideas.length === 1 ? "" : "s"}. Check them, then add.`;
    } catch (e) { status.textContent = ""; toast(e.message, true); }
  };
  shotInput.addEventListener("change", () => readShot(shotInput.files[0]));
  const drop = h("div", { class: "dropzone", onclick: () => shotInput.click() },
    h("b", {}, "Drop a screenshot of a list"), h("span", {}, "Notes, a whiteboard, a chat. Claude copies the items into the box above so you can check them."), shotInput);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); readShot(e.dataTransfer.files[0]); });
  const add = async () => {
    if (!box.value.trim()) return toast("Type or paste at least one idea.");
    try {
      const r = await api.post("/api/ideas/add", { text: box.value, channel: channel.value, format: format.value });
      O.projects = r.projects; O.current = r.current; O.ideaDraft = ""; box.value = "";
      drawSidebar();
      toast(`Added ${r.added.length} idea${r.added.length === 1 ? "" : "s"} to Not started.` +
        (r.skipped.length ? ` ${r.skipped.length} already existed.` : ""));
    } catch (e) { toast(e.message, true); }
  };
  body.replaceChildren(
    h("h3", {}, "Ideas box"),
    h("p", { class: "lead" }, "Each idea becomes a project in the sidebar under Not started, and goes to your dashboard file."),
    h("div", { class: "ideas-grid" },
      h("div", {}, box, h("div", { class: "row-actions" },
        h("label", { class: "inline" }, "Channel", channel), h("label", { class: "inline" }, "Type", format),
        h("button", { class: "btn primary", onclick: add }, "Add ideas"), status)),
      drop));
}

// ---------- YouTube setup (Settings → Connections) ----------
function youtubeSettings() {
  const wrap = h("div", { class: "field yt-setup" }, h("label", {}, "YouTube Analytics"), h("p", { class: "progress-text" }, "Loading…"));
  api.get("/api/youtube/status").then((yt) => {
    const file = h("input", { type: "file", accept: "application/json,.json" });
    file.addEventListener("change", async () => {
      try {
        await api.post("/api/youtube/client", { json: await file.files[0].text() });
        toast("Google app saved. Now connect a channel."); renderSettings();
      } catch (e) { toast(e.message, true); }
    });
    const connect = h("button", { class: "btn primary", disabled: !yt.client, onclick: () => {
      window.open("/api/youtube/connect", "_blank");
      window.addEventListener("focus", () => renderSettings(), { once: true });
    } }, yt.channels.length ? "Connect another channel" : "Connect a channel");
    wrap.replaceChildren(
      h("label", {}, "YouTube Analytics"),
      yt.channels.length ? h("div", { class: "yt-channels" }, ...yt.channels.map((c) => h("div", { class: "state-line" },
        h("span", { class: "ok" }, "✓"), h("b", {}, c.handle || c.title), h("span", { class: "progress-text" }, c.title),
        h("button", { class: "btn small", onclick: async () => { await api.post("/api/youtube/disconnect", { id: c.id }); renderSettings(); } }, "Disconnect")))) : null,
      h("details", { class: "steps", open: !yt.client },
        h("summary", {}, yt.client ? "Google app: set up ✓ (show the steps again)" : "One-time setup (about 10 minutes)"),
        h("ol", {},
          h("li", {}, "Go to console.cloud.google.com and create a project (any name, e.g. “BLKGRLCO Bin”)."),
          h("li", {}, "APIs & Services → Library: turn on “YouTube Data API v3” and “YouTube Analytics API”."),
          h("li", {}, "OAuth consent screen: User type External, app name “BLKGRLCO Bin”, your email. Add yourself as a test user. Then set Publishing status to In production. Otherwise Google signs you out every 7 days. Google will say the app isn't verified; that's expected for a personal app."),
          h("li", {}, "Credentials → Create credentials → OAuth client ID → Application type: Desktop app. Download the JSON."),
          h("li", {}, "Choose that JSON file here: ", file))),
      h("div", { class: "inline" }, connect,
        h("span", { class: "help" }, "Google asks which channel. Connect @blkgrlco, @blkgrlcotoo and the podcast one at a time. When Google warns the app isn't verified, choose Advanced → Go to BLKGRLCO Bin.")));
  }).catch((e) => wrap.replaceChildren(h("label", {}, "YouTube Analytics"), h("p", {}, e.message)));
  return wrap;
}
