"use strict";
/* Phase 5: Strategy tab. Audience Bullseye, Hook Machine, Channel Audit, Profiles & rules.
   Uses h(), api, toast, modal(), closeModal(), runJob(), progressBar(), S, O from the other scripts. */

const T = { channel: "@blkgrlco", sub: "bullseye", data: null, view: "topics", cmp: "topic", gen: null, profile: null, check: null };
const CH_LABEL = { "@blkgrlco": "@blkgrlco", "@blkgrlcotoo": "@blkgrlcotoo", podcast: "Podcast" };
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const ytLink = (url, text) => h("a", { href: url, target: "_blank", rel: "noopener" }, text);

async function renderStrategy() {
  const root = $("#tab-strategy");
  try { T.data = await api.get(`/api/strategy?channel=${encodeURIComponent(T.channel)}`); }
  catch (e) { put(root, h("div", { class: "placeholder" }, h("h2", {}, "Strategy"), h("p", {}, e.message))); return; }
  drawStrategy();
}

function drawStrategy() {
  const d = T.data, root = $("#tab-strategy");
  const subs = [["bullseye", "Audience Bullseye"], ["hooks", "Hook Machine"], ["audit", "Channel Audit"], ["profiles", "Profiles & rules"]];
  const body = h("div", { class: "subpanel" });
  put(root, h("div", { class: "settings" },
    h("nav", { class: "subtabs" },
      h("div", { class: "segmented small ch-pick" }, ...Object.keys(CH_LABEL).map((c) =>
        h("button", { class: T.channel === c ? "active" : "", onclick: () => { T.channel = c; T.gen = null; T.check = null; renderStrategy(); } }, CH_LABEL[c]))),
      h("p", { class: "persona" }, `Audience: `, h("b", {}, d.persona)),
      ...subs.map(([id, label]) => h("button", {
        class: (T.sub === id ? "active" : "") + (id === "profiles" && d.profiles[d.persona.toLowerCase()].missing.length ? " warn" : ""),
        onclick: () => { T.sub = id; drawStrategy(); } }, label)),
      h("p", { class: "side-note" }, "Only videos from the last 12 months. Outlier = views ÷ the median of that channel's last 30 uploads.")),
    body));
  if (!d.youtube.channels.length && T.sub !== "profiles") {
    body.append(h("h3", {}, "Strategy"), h("div", { class: "banner" }, "Connect a YouTube channel first: Strategy reads YouTube with that sign-in."),
      h("button", { class: "btn primary", onclick: () => { S.settingsTab = "connections"; showTab("settings"); } }, "Settings → Connections"));
    return;
  }
  ({ bullseye: drawBullseye, hooks: drawHooks, audit: drawAudit, profiles: drawProfiles })[T.sub](body);
}

function needsClaude() {
  return !T.data.claude ? h("div", { class: "banner" }, "Claude is off: grouping topics, finding skeletons, writing hooks and naming patterns need it. Add your API key in Settings → Connections.") : null;
}

function jobRunner(kind, path, body, label, after) {
  const holder = h("div", { class: "inline" });
  const running = T.data.jobs[kind]?.state === "running";
  const btn = h("button", { class: "btn primary", disabled: running, onclick: async () => {
    btn.disabled = true;
    const bar = progressBar();
    put(holder, btn, bar);
    try { const r = await runJob(path, body, bar.update); await renderStrategy(); if (after) after(r); }
    catch (e) { toast(e.message, true); bar.remove(); btn.disabled = false; }
  } }, running ? "Running…" : label);
  holder.append(btn);
  return holder;
}

// ---------- 1. Audience Bullseye ----------
function drawBullseye(body) {
  const d = T.data, b = d.bullseye, prof = d.profiles[d.persona.toLowerCase()];
  const head = h("div", { class: "row-head" },
    h("div", {}, h("h3", {}, `Audience Bullseye: ${d.persona}`),
      h("p", { class: "lead" }, `10–15 channels in ${d.persona}'s lane (favoring under 100K subscribers with high views), their 3x+ outliers grouped into topics, each scored out of 16.`)),
    jobRunner("bullseye", "/api/strategy/bullseye", { channel: T.channel }, b ? "Run again" : "Run Bullseye"));
  const warn = [];
  if (!prof.lanes && !prof.seed_channels) warn.push(h("div", { class: "banner" }, `Add search lanes or channels ${d.persona} watches in Profiles & rules first.`));
  if (prof.missing.length) warn.push(h("div", { class: "banner" }, `${d.persona}'s profile is missing: ${prof.missing.map((f) => d.profile_fields[f].toLowerCase()).join(", ")}. Audience fit is scored from it.`,
    " ", h("button", { class: "btn small", onclick: () => { T.sub = "profiles"; drawStrategy(); } }, "Fill it in")));
  if (!b) { append(body, head, needsClaude(), ...warn, h("p", { class: "progress-text" }, "No run yet. A run uses about 100 YouTube quota units per search lane (10,000 a day), and results are cached for a day.")); return; }
  const seg = h("div", { class: "segmented small" }, ...[["topics", `Topics (${b.topics.length})`], ["channels", `Channels (${b.channels.length})`], ["outliers", `Outliers (${b.outliers.length})`]].map(([k, l]) =>
    h("button", { class: T.view === k ? "active" : "", onclick: () => { T.view = k; drawStrategy(); } }, l)));
  const meta = h("p", { class: "progress-text" }, `Ran ${new Date(b.ran).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · lanes: ${b.lanes.join(", ") || "—"} · about ${b.quota_units} quota units`);
  const byId = Object.fromEntries(b.outliers.map((o) => [o.id, o]));
  let content;
  if (T.view === "topics") {
    content = b.topics.length ? h("div", { class: "bulls-grid" }, bullseyeChart(b.topics),
      h("ol", { class: "topic-list" }, ...b.topics.map((t, i) => h("li", { class: "topic" },
        h("div", { class: "topic-head" }, h("span", { class: "rank-n" }, String(i + 1)), h("b", {}, t.name),
          h("span", { class: `tag funnel-${t.funnel.toLowerCase()}` }, `${t.funnel} of funnel`), h("span", { class: "score16" }, `${t.score}/16`)),
        h("div", { class: "parts" }, ...[["audience_fit", "Audience fit"], ["demand", "Demand"], ["gap", "Competition gap"], ["filmable", "Thu–Sat filmable"]].map(([k, l]) =>
          h("span", { title: t.why[k] }, `${l} `, h("b", {}, `${t.parts[k]}/4`)))),
        h("p", { class: "desc" }, "Idea: ", h("i", {}, t.idea)),
        h("div", { class: "sources" }, ...t.video_ids.slice(0, 3).map((id) => byId[id] ? ytLink(byId[id].url, `${byId[id].score}x · ${byId[id].title.slice(0, 48)}`) : null),
          t.video_ids.length > 3 ? h("span", { class: "progress-text" }, `+${t.video_ids.length - 3} more`) : null),
        h("button", { class: "btn small", disabled: !!t.sent, onclick: async (ev) => {
          ev.target.disabled = true;
          try {
            const r = await api.post("/api/strategy/send-topic", { channel: T.channel, id: t.id });
            O.projects = r.projects; drawSidebar(); t.sent = true; ev.target.textContent = "In the idea bank ✓";
            toast(r.added.length ? "Added to Not started and the dashboard file." : "That idea was already there.");
          } catch (e) { toast(e.message, true); ev.target.disabled = false; }
        } }, t.sent ? "In the idea bank ✓" : "Send to idea bank")))))
      : h("div", { class: "banner" }, b.notes.join(" ") || "No topics.");
  } else if (T.view === "channels") {
    content = h("div", { class: "table-wrap tall" }, h("table", { class: "ops" },
      h("thead", {}, h("tr", {}, ...["Channel", "Subscribers", "Median views (last 30)", "Outliers", "Found by"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...b.channels.map((c) => h("tr", {}, h("td", {}, ytLink(c.url, c.title)), h("td", {}, num(c.subs)), h("td", {}, num(c.median)),
        h("td", {}, String(c.outliers)), h("td", { class: "progress-text" }, c.lanes.join(", ")))))));
  } else {
    content = h("div", { class: "table-wrap tall" }, h("table", { class: "ops" },
      h("thead", {}, h("tr", {}, ...["Score", "Video", "Channel", "Views", "Channel median"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...b.outliers.map((o) => h("tr", {}, h("td", { class: "flag" }, `${o.score}x`), h("td", {}, ytLink(o.url, o.title)),
        h("td", {}, o.channel), h("td", {}, num(o.views)), h("td", {}, num(o.median)))))));
  }
  append(body, head, needsClaude(), ...warn, h("div", { class: "toolbar-row" }, seg, meta),
    b.notes.length && T.view === "topics" && b.topics.length ? h("div", { class: "banner" }, b.notes.join(" ")) : null, content);
}

function bullseyeChart(topics) {
  const S0 = 300, c = S0 / 2, rings = [["bullseye", 13, 0.25], ["inner", 9, 0.5], ["middle", 5, 0.75], ["outer", 0, 1]];
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${S0} ${S0}`); svg.setAttribute("class", "bullseye"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Topics on a bullseye: closer to the center scores higher");
  let html = rings.slice().reverse().map(([k, , r], i) => `<circle cx="${c}" cy="${c}" r="${r * (c - 6)}" class="ring r${3 - i}"/>`).join("");
  topics.forEach((t, i) => {
    const r = (1 - t.score / 16) * (c - 16) + 6;
    const a = (i * 137.5 * Math.PI) / 180;
    const x = c + r * Math.cos(a), y = c + r * Math.sin(a);
    html += `<g class="pin"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${i + 1}</text><title>${i + 1}. ${t.name.replace(/[<&]/g, "")}: ${t.score}/16</title></g>`;
  });
  svg.innerHTML = html;
  return h("div", { class: "bulls-chart" }, svg, h("p", { class: "progress-text" }, "Center = 13–16 · then 9–12 · 5–8 · 0–4. Numbers match the list."));
}

// ---------- 2. Hook Machine ----------
function drawHooks(body) {
  const d = T.data, sk = d.skeletons;
  const plans = d.plans.filter((p) => p.channel === T.channel);
  const openBox = h("textarea", { class: "input", rows: 4, placeholder: "One per line: video link, a tab or |, then what they say in the first 5 seconds" });
  const head = h("div", { class: "row-head" },
    h("div", {}, h("h3", {}, "Hook Machine"),
      h("p", { class: "lead" }, `Reusable hook skeletons from the top outliers in ${d.persona}'s lane, each with how many outliers use it and their median outlier score.`)),
    jobRunner("skeletons", "/api/strategy/skeletons", { channel: T.channel }, sk ? "Find skeletons again" : "Find skeletons"));
  const openings = h("details", { class: "steps" },
    h("summary", {}, `Opening lines (${d.openings} saved)`),
    h("p", { class: "progress-text" }, "YouTube only gives captions for your own videos, so other creators' first 5 seconds are pasted here (or saved from a TubeLab transcript in a Claude session). Frames are never downloaded from other people's videos."),
    openBox, h("button", { class: "btn small", onclick: async () => {
      try { const r = await api.post("/api/strategy/openings", { text: openBox.value }); toast(`Saved ${r.imported} opening line${r.imported === 1 ? "" : "s"}.`); renderStrategy(); }
      catch (e) { toast(e.message, true); }
    } }, "Save opening lines"));
  if (!sk) { append(body, head, needsClaude(), !d.bullseye ? h("div", { class: "banner" }, "Run the Audience Bullseye first: the Hook Machine studies its outliers.") : null, openings); return; }
  if (!plans.some((p) => p.id === T.pickPid)) T.pickPid = plans[0]?.id || "";
  const pickPlan = h("select", { class: "input", onchange: (e) => { T.pickPid = e.target.value; } },
    plans.length ? plans.map((p) => h("option", { value: p.id, selected: p.id === T.pickPid }, p.name)) : h("option", { value: "" }, `No ${T.channel} ideas yet`));
  const cards = sk.skeletons.map((s) => h("article", { class: "sk-card" },
    h("div", { class: "sk-head" }, h("code", {}, s.pattern), h("span", { class: "score16" }, `${s.median_score}x`)),
    h("p", { class: "progress-text" }, `${s.count} outliers · median ${s.median_score}x · ${s.why}`),
    h("div", { class: "sk-examples" }, ...s.examples.map((e) => h("a", { class: "sk-ex", href: e.url, target: "_blank", rel: "noopener" },
      e.thumbnail ? h("img", { src: e.thumbnail, alt: "", loading: "lazy" }) : null,
      h("span", {}, h("b", {}, `${e.score}x `), e.title), e.opening ? h("span", { class: "progress-text" }, `“${e.opening}”`) : null))),
    h("button", { class: "btn small primary", disabled: !plans.length, onclick: async (ev) => {
      ev.target.disabled = true; ev.target.textContent = "Writing…";
      try { T.gen = { ...(await api.post("/api/strategy/hooks", { channel: T.channel, skeleton: s.id, pid: pickPlan.value })), pid: pickPlan.value, skeleton_id: s.id }; drawStrategy(); }
      catch (e) { toast(e.message, true); ev.target.disabled = false; ev.target.textContent = "Generate hooks"; }
    } }, "Generate hooks")));
  const gen = T.gen ? h("div", { class: "gen" },
    h("div", { class: "row-head" }, h("h4", {}, `${T.gen.hooks.length} hook${T.gen.hooks.length === 1 ? "" : "s"} for “${(plans.find((p) => p.id === T.gen.pid) || {}).name || "your idea"}”`), h("code", {}, T.gen.skeleton)),
    ...T.gen.notes.map((n) => h("div", { class: "banner" }, n)),
    ...T.gen.hooks.map((x) => h("div", { class: "hook-row2" },
      h("div", {}, h("b", {}, x.hook), h("div", { class: "progress-text" }, `Title: ${x.title}`),
        h("div", { class: "checks inline-checks" },
          h("span", { class: x.stops_scroll ? "ok" : "bad", title: x.why }, `${x.stops_scroll ? "✓" : "✗"} would ${T.gen.persona} stop scrolling?`),
          ...x.checks.map((c) => h("span", { class: c.ok ? "ok" : "bad" }, `${c.ok ? "✓" : "✗"} ${c.label}`)))),
      h("button", { class: "btn small", onclick: async (ev) => {
        try { await api.post("/api/strategy/hooks/approve", { pid: T.gen.pid, text: x.hook, skeleton: T.gen.skeleton, title: x.title }); ev.target.textContent = "Saved to plan ✓"; ev.target.disabled = true; toast("Saved to the project's Plan tab (Titles → Hooks)."); }
        catch (e) { toast(e.message, true); }
      } }, "Save to plan")))) : null;
  const check = T.check ? h("div", { class: "card-box" },
    h("h4", {}, "Skeleton score vs your real 3-second hold"),
    h("table", { class: "ops" }, h("thead", {}, h("tr", {}, ...["Your video", "Skeleton", "Skeleton median", "Held at 0:03"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...T.check.rows.map((r) => h("tr", {}, h("td", {}, ytLink(r.url, r.title)), h("td", {}, r.skeleton),
        h("td", {}, r.skeleton_score == null ? "—" : `${r.skeleton_score}x`), h("td", {}, `${pct(r.hold_3s)}${r.exact ? "" : ` (≈, ${r.step_seconds}s steps)`}`))))),
    h("p", {}, T.check.rho == null ? `Only ${T.check.paired} video(s) used a skeleton: not enough to compare.` : `Rank correlation across ${T.check.paired} videos: ${T.check.rho} (1 = skeleton score predicts the hold perfectly, 0 = no link).`),
    h("p", { class: "progress-text" }, T.check.note)) : null;
  append(body, head, needsClaude(), openings,
    h("div", { class: "toolbar-row" }, h("span", {}, "Write hooks for"), pickPlan,
      d.own_channel ? jobRunner("skcheck", "/api/strategy/skeleton-check", { channel: T.channel, count: 5 }, "Check skeletons against my last 5 videos", (r) => { T.check = r; drawStrategy(); }) : null),
    gen, check, h("div", { class: "sk-grid" }, ...cards));
}

// ---------- 3. Channel Audit ----------
function drawAudit(body) {
  const d = T.data, a = d.audit;
  const head = h("div", { class: "row-head" },
    h("div", {}, h("h3", {}, `Channel Audit: ${T.channel}`),
      h("p", { class: "lead" }, "Your last 50 uploads (last 12 months): above-median vs below-median videos compared on topic, format, hook skeleton, story map (B1–B5) and how many viewers are still watching at 0:30. Runs again every Sunday evening after the weekly long-form posts.")),
    d.own_channel ? jobRunner("audit", "/api/strategy/audit", { channel: T.channel }, a ? "Run again now" : "Run audit") : null);
  if (!d.own_channel) { append(body, head, h("div", { class: "banner" }, `Connect ${T.channel} in Settings → Connections to audit it.`)); return; }
  if (!a) { append(body, head, needsClaude(), h("p", { class: "progress-text" }, "No audit yet.")); return; }
  const patterns = h("div", { class: "patterns" }, ...a.patterns.map((p) => h("article", { class: "pattern" },
    h("b", {}, p.name), h("code", {}, p.template), h("p", {}, p.finding),
    h("div", { class: "sources" }, h("span", { class: "progress-text" }, "Proof:"), ...p.proof.map((v) => ytLink(v.url, `${v.title.slice(0, 50)} (${num(v.views)} views)`))))));
  const tbl = a.compare[T.cmp] || [];
  append(body, head, needsClaude(),
    h("p", { class: "progress-text" }, `Last run ${new Date(a.ran).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · ${a.videos.length} videos · median ${num(a.median_views)} views`),
    h("h4", {}, "Patterns"), a.patterns.length ? patterns : h("p", { class: "progress-text" }, "No pattern with proof from your own videos yet."),
    h("div", { class: "toolbar-row" }, h("h4", {}, "Above vs below median"),
      h("div", { class: "segmented small" }, ...[["topic", "Topic"], ["format", "Format"], ["skeleton", "Hook skeleton"], ["story", "Story map"]].map(([k, l]) =>
        h("button", { class: T.cmp === k ? "active" : "", onclick: () => { T.cmp = k; drawStrategy(); } }, l)))),
    h("table", { class: "ops" }, h("thead", {}, h("tr", {}, ...["", "Above median", "Below median", "Still watching at 0:30"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...tbl.map((x) => h("tr", {}, h("td", {}, h("b", {}, x.value)), h("td", {}, String(x.above)), h("td", {}, String(x.below)), h("td", {}, pct(x.avg_hold_30s)))))),
    h("details", { class: "steps" }, h("summary", {}, `All ${a.videos.length} videos`),
      h("div", { class: "table-wrap" }, h("table", { class: "ops" },
        h("thead", {}, h("tr", {}, ...["Video", "Views", "Group", "Topic", "Format", "Skeleton", "Story", "0:30"].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...a.videos.map((v) => h("tr", {}, h("td", {}, ytLink(v.url, v.title)), h("td", {}, num(v.views)), h("td", {}, v.group),
          h("td", {}, v.topic), h("td", { title: v.format_source }, v.format), h("td", {}, v.skeleton), h("td", {}, v.story), h("td", {}, pct(v.hold_30s)))))))),
    (() => { const box = h("div", { class: "card-box" }); drawLosesViewers(box, true); return box; })());
}

// ---------- 4. Profiles & rules ----------
function drawProfiles(body) {
  const d = T.data;
  if (!T.profile) T.profile = d.persona.toLowerCase();
  const prof = d.profiles[T.profile];
  const inputs = {};
  const form = h("div", { class: "profile-form" }, ...Object.entries(d.profile_fields).map(([k, label]) => {
    inputs[k] = h("textarea", { class: "input", rows: ["lanes", "seed_channels", "who"].includes(k) ? 4 : 2 });
    inputs[k].value = prof[k] || "";
    return h("div", { class: "field" + (prof.missing.includes(k) ? " missing" : "") }, h("label", {}, label, prof.missing.includes(k) ? h("span", { class: "warn-text" }, "  · missing") : null), inputs[k]);
  }));
  const ruleInputs = {};
  const rules = h("div", { class: "profile-form" }, ...Object.entries(d.rule_fields).map(([k, label]) => {
    ruleInputs[k] = h("textarea", { class: "input", rows: k === "oct21" ? 6 : 3 });
    ruleInputs[k].value = d.rules[k] || "";
    return h("div", { class: "field" + (!d.rules[k] ? " missing" : "") }, h("label", {}, label, !d.rules[k] ? h("span", { class: "warn-text" }, "  · not added yet") : null), ruleInputs[k]);
  }));
  const guarded = async (path, payload, after) => {
    const r = await api.post(path, payload);
    if (r.needs_confirm) {
      modal(h("div", { class: "modal-head" }, h("h3", {}, "Replace what's saved?"), h("p", {}, "These saved answers would change. Nothing is replaced unless you say yes.")),
        h("div", { class: "modal-body" }, ...r.changes.map((c) => h("div", { class: "diff" }, h("b", {}, c.label),
          h("div", { class: "old" }, c.old), h("div", { class: "new" }, c.new)))),
        h("div", { class: "modal-foot" }, h("button", { class: "btn", onclick: closeModal }, "No, keep what's saved"),
          h("button", { class: "btn primary", onclick: async () => { await api.post(path, { ...payload, confirm: true }); closeModal(); toast("Saved."); after(); } }, "Yes, replace")));
      return;
    }
    toast("Saved."); after();
  };
  append(body,
    h("h3", {}, "Audience profiles"),
    h("p", { class: "lead" }, "Nia (@blkgrlco), Zara (@blkgrlcotoo), Amara (the podcast). The Bullseye scores audience fit from these, and the Hook Machine writes for them. A saved answer is never replaced without your yes."),
    h("div", { class: "segmented small" }, ...Object.entries(d.profiles).map(([k, p]) =>
      h("button", { class: T.profile === k ? "active" : "", onclick: () => { T.profile = k; drawStrategy(); } }, `${p.name}${p.missing.length ? " •" : ""}`))),
    form,
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => guarded("/api/strategy/profile",
      { key: T.profile, changes: Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])) }, renderStrategy) }, `Save ${prof.name}`)),
    h("h3", { class: "section-gap" }, "Rules"),
    h("p", { class: "lead" }, "Your Oct 21 outlier-study rules apply to @blkgrlco dailies and long-forms in the Hook Machine. Paste them here."),
    rules,
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => guarded("/api/strategy/rules",
      { changes: Object.fromEntries(Object.entries(ruleInputs).map(([k, el]) => [k, el.value])) }, renderStrategy) }, "Save rules")));
}
