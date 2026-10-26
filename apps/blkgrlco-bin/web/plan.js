"use strict";
/* Plan tab: details, titles, thumbnails, script & music. Uses h(), api, toast, S from app.js. */

const P = { view: null, sub: "details", thumbView: {}, scoring: false, saveTimer: null };

async function renderPlan() {
  const root = $("#tab-plan");
  try {
    P.view = await api.get("/api/plan");
  } catch (e) {
    root.replaceChildren(h("div", { class: "placeholder" },
      h("h2", {}, "Plan"), h("p", {}, e.status === 409 ? "Open a video's folder in the Media tab first." : e.message)));
    return;
  }
  drawPlan();
}

function setPlanView(v) { P.view = v; drawPlan(); }

// Node.append() would print "null" for optional parts, so skip them.
const append = (el, ...items) => el.append(...items.filter((x) => x !== null && x !== undefined && x !== false));

function drawPlan() {
  const root = $("#tab-plan");
  const v = P.view, d = v.plan.details, c = v.check;
  const subs = [["details", "Video details"], ["titles", `Titles ${c.written}/${c.need}`], ["thumbs", `Thumbnails${v.plan.thumbs.length ? " " + v.plan.thumbs.length : ""}`], ["script", "Script & music"]];
  const body = h("div", { class: "subpanel" });
  root.replaceChildren(h("div", { class: "settings" },
    h("nav", { class: "subtabs" },
      h("div", { class: "plan-name", title: v.plan.folder || "No folder yet" }, d.name),
      h("span", { class: `status st-${d.status}` }, v.statuses[d.status]),
      ...subs.map(([id, label]) => h("button", {
        class: (P.sub === id ? "active" : "") + (id === "titles" && c.long_form && !c.ok ? " warn" : ""),
        onclick: () => { P.sub = id; drawPlan(); },
      }, label)),
      h("p", { class: "export-note" }, "Ticked titles go to your dashboard file:", h("br"), h("code", {}, v.export_path))),
    body));
  ({ details: planDetails, titles: planTitles, thumbs: planThumbs, script: planScript })[P.sub](body);
}

async function planPost(path, body, msg) {
  try {
    const v = await api.post(path, body);
    setPlanView(v);
    if (msg) toast(msg);
    return v;
  } catch (e) { toast(e.message, true); return null; }
}

// ---------- details ----------
function planDetails(body) {
  const v = P.view, d = v.plan.details;
  const save = (changes) => planPost("/api/plan/details", { changes }, "Saved.");
  const name = h("input", { class: "input", value: d.name });
  name.addEventListener("change", () => save({ name: name.value }));
  append(body, 
    h("h3", {}, "Video details"),
    h("p", { class: "lead" }, v.plan.folder ? `Folder: ${v.plan.folder}` : "No T7 folder linked yet."),
    h("div", { class: "form-grid" },
      h("div", { class: "field" }, h("label", {}, "Working name"), name),
      h("div", { class: "field" }, h("label", {}, "Post date"),
        h("input", { class: "input", type: "date", value: d.post_date, onchange: (e) => save({ post_date: e.target.value }) })),
      h("div", { class: "field" }, h("label", {}, "Channel"),
        h("select", { class: "input", onchange: (e) => save({ channel: e.target.value }) },
          ...Object.entries(v.channels).map(([k, l]) => h("option", { value: k, selected: k === d.channel }, l)))),
      h("div", { class: "field" }, h("label", {}, "Video type"),
        h("select", { class: "input", onchange: (e) => save({ format: e.target.value }) },
          ...v.formats.map((f) => h("option", { value: f, selected: f === d.format }, f)))),
      h("div", { class: "field" }, h("label", {}, "Status"),
        h("div", { class: "segmented" }, ...Object.entries(v.statuses).map(([k, l]) =>
          h("button", { class: d.status === k ? "active" : "", onclick: () => save({ status: k }) }, l))))));
}

// ---------- titles ----------
function planTitles(body) {
  const v = P.view, c = v.check;
  const box = h("textarea", { class: "input", rows: 3, placeholder: "Type a title, or paste a list (one per line)" });
  const add = () => { if (box.value.trim()) planPost("/api/plan/titles/add", { text: box.value }); };
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); });
  const thumbsFor = (tid) => v.plan.thumbs.filter((t) => t.title_id === tid).map((t) => t.label);
  const rows = v.plan.titles.map((t) => {
    const text = h("input", { class: "input title-text", value: t.text });
    const count = h("span", { class: "cc" + ([...t.text].length > 100 ? " over" : "") }, `${[...t.text].length}/100`);
    text.addEventListener("input", () => { const n = [...text.value].length; count.textContent = `${n}/100`; count.classList.toggle("over", n > 100); });
    text.addEventListener("change", () => planPost("/api/plan/titles/update", { id: t.id, changes: { text: text.value } }));
    const linked = thumbsFor(t.id);
    return h("div", { class: "title-row" + (t.approved ? " approved" : "") },
      h("label", { class: "tick", title: "Tick to send it to your dashboard" },
        h("input", { type: "checkbox", checked: t.approved,
          onchange: (e) => planPost("/api/plan/titles/update", { id: t.id, changes: { approved: e.target.checked } },
            e.target.checked ? "Sent to your dashboard file." : "Taken off the dashboard file.") })),
      text, count,
      h("span", { class: "linked" }, linked.length ? `thumb ${linked.join(", ")}` : ""),
      h("button", { class: "icon-btn", title: "Remove this title", onclick: () => planPost("/api/plan/titles/update", { id: t.id, changes: { remove: true } }) }, "×"));
  });
  append(body, 
    h("h3", {}, "Title ideas"),
    h("p", { class: "lead" }, "Tick a title to send it to your BLKGRLCO Studios dashboard."),
    c.long_form ? h("div", { class: "banner" + (c.ok ? " ok" : "") },
      c.ok ? `Long-form: ${c.written} titles written. ${c.approved} ticked for the dashboard.`
        : `Every long-form needs 3 titles. ${c.written} written so far.`) : null,
    h("div", { class: "title-add" }, box, h("button", { class: "btn primary", onclick: add }, "Add")),
    h("div", { class: "title-list" }, rows.length ? rows : h("p", { class: "progress-text" }, "No titles yet.")));
}

// ---------- thumbnails ----------
function planThumbs(body) {
  const v = P.view;
  const titles = v.plan.titles;
  const list = [...v.plan.thumbs].sort((a, b) => (a.rank || 99) - (b.rank || 99) || a.label.localeCompare(b.label));
  const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, class: "hidden" });
  input.addEventListener("change", () => uploadThumbs([...input.files]));
  const drop = h("div", { class: "dropzone", onclick: () => input.click() },
    h("b", {}, "Drop your 3 thumbnail PNGs here"), h("span", {}, "or click to choose them. Made in Canva at 1280×720 is perfect."), input);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); uploadThumbs([...e.dataTransfer.files]); });

  const cards = list.map((t) => {
    const mode = P.thumbView[t.id] || "normal";
    const src = mode === "cb" && t.previews?.cb ? t.previews.cb : mode === "phone" && t.previews?.phone ? t.previews.phone : t.file;
    const img = h("img", { src: `/api/thumb/${v.plan.id}/${src}`, alt: `Thumbnail ${t.label}`, class: mode === "phone" ? "phone-size" : "" });
    const checks = (t.checks || []).map((c) => h("li", { class: c.ok === true ? "ok" : c.ok === false ? "bad" : "na", title: c.detail },
      h("span", { class: "mark" }, c.ok === true ? "✓" : c.ok === false ? "✗" : "–"), h("span", {}, h("b", {}, c.label), " ", c.detail)));
    return h("article", { class: "thumb-card" + (t.rank === 1 ? " top" : "") },
      h("div", { class: "thumb-img" }, img,
        t.rank ? h("span", { class: "rank" }, `#${t.rank}`) : null,
        t.score != null ? h("span", { class: "score", title: `Base ${t.base} (${t.base_from}) minus the failed checks` }, String(t.score)) : null),
      h("div", { class: "segmented small" }, ...[["normal", "Normal"], ["cb", "Colorblind"], ["phone", "Phone size"]].map(([k, l]) =>
        h("button", { class: mode === k ? "active" : "", disabled: k !== "normal" && !t.previews?.[k],
          onclick: () => { P.thumbView[t.id] = k; drawPlan(); } }, l))),
      h("div", { class: "thumb-meta" }, h("b", {}, `Thumbnail ${t.label}`), h("span", { class: "progress-text" }, t.original_name)),
      t.why ? h("p", { class: "desc" }, t.why) : null,
      t.note ? h("p", { class: "desc warn-text" }, t.note) : null,
      checks.length ? h("ul", { class: "checks" }, checks) : h("p", { class: "progress-text" }, P.scoring ? "Scoring…" : "Not scored yet."),
      h("div", { class: "thumb-foot" },
        h("select", { class: "cat-select", onchange: (e) => planPost("/api/plan/thumbs/update", { id: t.id, changes: { title_id: e.target.value } }) },
          h("option", { value: "" }, titles.length ? "Link to a title…" : "Add titles first"),
          ...titles.map((x) => h("option", { value: x.id, selected: x.id === t.title_id }, x.text.slice(0, 60)))),
        h("button", { class: "icon-btn", title: "Take off the plan (the image is kept)", onclick: () => planPost("/api/plan/thumbs/remove", { id: t.id }) }, "×")));
  });

  append(body, 
    h("div", { class: "row-head" },
      h("div", {}, h("h3", {}, "Thumbnails"),
        h("p", { class: "lead" }, "Ranked by click-appeal score (0–100): Claude's appeal rating minus points for each failed check. It compares your options; it doesn't predict click-through.")),
      h("button", { class: "btn", disabled: !list.length || P.scoring, onclick: () => scoreThumbs() }, P.scoring ? "Scoring…" : "Re-score")),
    !v.claude ? h("div", { class: "banner" }, "Claude is off, so words, readability and face position aren't checked, and every thumbnail starts at 70. Add your API key in Settings → Connections.") : null,
    list.length < 3 ? drop : null,
    h("div", { class: "thumb-grid" }, cards));
}

async function uploadThumbs(files) {
  const imgs = files.filter((f) => /image\/(png|jpeg|webp)/.test(f.type));
  if (!imgs.length) return toast("Drop PNG or JPG files.", true);
  for (const f of imgs) {
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    const v = await planPost("/api/plan/thumbs/upload", { name: f.name, data });
    if (!v) return;
  }
  scoreThumbs();
}

async function scoreThumbs() {
  P.scoring = true; drawPlan();
  try { P.view = await api.post("/api/plan/thumbs/score", {}); toast("Thumbnails scored."); }
  catch (e) { toast(e.message, true); }
  P.scoring = false; drawPlan();
}

// ---------- script & music ----------
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SONG_RE = /@\[([^\]\n]{1,200})\]\(([0-9a-f]{16}(?:~\d+)?)\)/g;

function songChip(name, fid) {
  return `<span class="song" contenteditable="false" data-fid="${fid}" data-name="${escapeHtml(name)}">♪ ${escapeHtml(name)}</span>`;
}

function scriptToHtml(text) {
  let out = "", last = 0;
  for (const m of text.matchAll(SONG_RE)) {
    out += escapeHtml(text.slice(last, m.index)) + songChip(m[1], m[2]);
    last = m.index + m[0].length;
  }
  return (out + escapeHtml(text.slice(last))).replace(/\n/g, "<br>") + "<br>";
}

function htmlToScript(node) {
  let out = "";
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/ /g, " ");
      else if (c.nodeName === "BR") out += "\n";
      else if (c.classList?.contains("song")) out += `@[${c.dataset.name}](${c.dataset.fid})`;
      else if (c.nodeName === "DIV" || c.nodeName === "P") { if (out && !out.endsWith("\n")) out += "\n"; walk(c); }
      else walk(c);
    }
  };
  walk(node);
  return out.replace(/\n$/, "");
}

function planScript(body) {
  const v = P.view;
  const ed = h("div", { class: "script-editor", contenteditable: "true", spellcheck: "true",
    "data-placeholder": "Write the script. Type @ where a song starts playing." });
  ed.innerHTML = v.plan.script ? scriptToHtml(v.plan.script) : "";
  const pop = h("div", { class: "song-pop hidden" });
  const cueBox = h("div", { class: "cues" });
  const status = h("span", { class: "progress-text" }, "");
  let popItems = [], popIndex = 0, popQuery = null;

  const drawCues = (cues) => cueBox.replaceChildren(
    cues.length ? h("ol", {}, ...cues.map((c) => h("li", { class: c.missing ? "missing" : "" },
      h("b", {}, `♪ ${c.name}`), h("span", { class: "progress-text" }, ` line ${c.line}`),
      c.missing ? h("span", { class: "warn-text" }, " · not in this project's Music anymore") : null,
      h("div", { class: "desc" }, c.context))))
      : h("p", { class: "progress-text" }, "No songs tagged yet."));
  drawCues(v.cues);

  const save = () => {
    clearTimeout(P.saveTimer);
    status.textContent = "Saving…";
    P.saveTimer = setTimeout(async () => {
      try {
        const r = await api.post("/api/plan/script", { text: htmlToScript(ed) });
        P.view = r; drawCues(r.cues); status.textContent = "Saved";
      } catch (e) { status.textContent = "Couldn't save. Keep this tab open and try again."; }
    }, 700);
  };

  const caretQuery = () => {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3 || !ed.contains(node)) return null;
    const before = node.nodeValue.slice(0, sel.anchorOffset);
    const m = before.match(/(?:^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30}){0,2})$/);
    return m ? { node, end: sel.anchorOffset, start: sel.anchorOffset - m[1].length - 1, q: m[1].toLowerCase() } : null;
  };

  const closePop = () => { pop.classList.add("hidden"); popQuery = null; };
  const openPop = (q) => {
    popItems = v.music.filter((m) => m.name.toLowerCase().includes(q.q));
    popQuery = q; popIndex = 0;
    const rect = (() => { const r = document.createRange(); r.setStart(q.node, q.end); r.collapse(true); return r.getBoundingClientRect(); })();
    const host = ed.parentElement.getBoundingClientRect();
    pop.style.left = `${Math.max(0, rect.left - host.left)}px`;
    pop.style.top = `${rect.bottom - host.top + 4}px`;
    pop.replaceChildren(...(popItems.length ? popItems.map((m, i) => h("button", { class: i === popIndex ? "active" : "", onmousedown: (e) => { e.preventDefault(); insertSong(m); } },
      "♪ ", m.name)) : [h("div", { class: "progress-text" }, v.music.length ? "No song matches." : "No Music files in this project yet. Sort them in the Media tab first.")]));
    pop.classList.remove("hidden");
  };

  const insertSong = (m) => {
    const q = popQuery || caretQuery();
    if (q) {
      const range = document.createRange();
      range.setStart(q.node, q.start); range.setEnd(q.node, q.end);
      range.deleteContents();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    } else if (!ed.contains(getSelection().anchorNode)) {  // not typing in the script: add at the end
      ed.focus();
      const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand("insertHTML", false, songChip(m.name, m.fid) + "&nbsp;");
    closePop(); save();
  };

  ed.addEventListener("input", () => { const q = caretQuery(); if (q) openPop(q); else closePop(); save(); });
  ed.addEventListener("keydown", (e) => {
    if (popQuery && !pop.classList.contains("hidden") && popItems.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); popIndex = (popIndex + (e.key === "ArrowDown" ? 1 : -1) + popItems.length) % popItems.length;
        [...pop.children].forEach((b, i) => b.classList.toggle("active", i === popIndex)); return;
      }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertSong(popItems[popIndex]); return; }
    }
    if (e.key === "Escape") { closePop(); return; }
    if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
  });
  ed.addEventListener("paste", (e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); });
  ed.addEventListener("blur", () => setTimeout(closePop, 150));

  append(body, 
    h("div", { class: "row-head" },
      h("div", {}, h("h3", {}, "Script & music"),
        h("p", { class: "lead" }, "Type @ at the spot a song starts, then pick it from this project's Music files.")),
      status),
    h("div", { class: "script-wrap" },
      h("div", { class: "editor-host" }, ed, pop),
      h("aside", { class: "script-side" },
        h("h4", {}, "Music in this project"),
        v.music.length ? h("div", { class: "songs" }, ...v.music.map((m) =>
          h("button", { class: "chip", title: "Insert at the cursor", onmousedown: (e) => { e.preventDefault(); insertSong(m); } }, "♪ ", m.name)))
          : h("p", { class: "progress-text" }, "No Music files yet. Sort the folder in the Media tab (category Music)."),
        h("h4", {}, "Music cues, in order"), cueBox)));
}
