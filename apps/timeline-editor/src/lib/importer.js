// Import without uploading. The browser never reads file contents here: from a drop
// or the system file picker we take only each file's name, size and folder path,
// and the local server finds the real file on disk and imports it by path.

const LIMIT = 5000;

function readEntries(dirEntry) {
  // readEntries returns results in batches; keep calling until it's empty
  const reader = dirEntry.createReader();
  return new Promise((resolve) => {
    const all = [];
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      next();
    }, () => resolve(all));
    next();
  });
}

const entryFile = (entry) => new Promise((resolve) => entry.file(resolve, () => resolve(null)));

async function walk(entry, prefix, out) {
  if (out.length >= LIMIT) return;
  if (entry.isFile) {
    const f = await entryFile(entry); // a File handle: metadata only, nothing is read
    if (f) out.push({ name: f.name, size: f.size, relPath: prefix + f.name });
  } else if (entry.isDirectory) {
    for (const child of await readEntries(entry)) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

/** Names and sizes of everything dropped, including inside dropped folders. */
export async function describeDrop(dataTransfer) {
  const out = [];
  const entries = [...dataTransfer.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) {
    for (const e of entries) await walk(e, "", out);
  } else {
    for (const f of dataTransfer.files) out.push({ name: f.name, size: f.size, relPath: f.name });
  }
  return out;
}

/** Names and sizes from an <input type="file"> selection. */
export const describeFileList = (files) =>
  [...files].slice(0, LIMIT).map((f) => ({ name: f.name, size: f.size, relPath: f.webkitRelativePath || f.name }));

export async function importPaths(paths) {
  const r = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  }).then((r) => r.json());
  if (!r.ok) throw new Error(r.error || "Import failed");
  return r;
}

/** Find described files on disk, then import them. Returns a summary sentence. */
export async function importDescribed(files) {
  if (!files.length) return "Nothing to import there.";
  const loc = await fetch("/api/locate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  }).then((r) => r.json());
  if (!loc.ok) throw new Error(loc.error || "Couldn't look for the files");
  let summary = "";
  if (loc.found.length) {
    const r = await importPaths(loc.found);
    summary = summarize(r);
  }
  if (loc.missing.length) {
    const names = loc.missing.slice(0, 4).join(", ") + (loc.missing.length > 4 ? ` and ${loc.missing.length - 4} more` : "");
    summary += `${summary ? " " : ""}Couldn't find ${names} on this computer${loc.timedOut ? " in time" : ""}: use Import… to pick ${loc.missing.length > 1 ? "them" : "it"} by folder.`;
  }
  return summary;
}

export function summarize(r) {
  const parts = [];
  if (r.added.length) parts.push(`Added ${r.added.length} file${r.added.length > 1 ? "s" : ""}.`);
  if (r.skipped) parts.push(`${r.skipped} already in the bin.`);
  if (r.failed.length) parts.push(`Couldn't import ${r.failed.map((f) => `${f.file.split("/").pop()} (${f.error})`).join(", ")}.`);
  return parts.join(" ") || "Nothing new to import.";
}
