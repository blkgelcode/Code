import React, { useEffect, useRef, useState } from "react";
import { fmtBytes } from "../lib/format.js";
import { importPaths, summarize, importDescribed, describeFileList } from "../lib/importer.js";

/**
 * Pick files or folders by path. The listing comes from the local server, so it
 * shows real paths on this Mac, including external drives under /Volumes.
 */
export default function ImportDialog({ onClose, setNotice }) {
  const [places, setPlaces] = useState([]);
  const [dir, setDir] = useState(null);
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const folderInput = useRef(null);

  useEffect(() => {
    fetch("/api/places").then((r) => r.json()).then((p) => {
      setPlaces(p);
      const start = p.find((x) => x.recent) || p.find((x) => x.drive) || p.find((x) => x.name === "Movies") || p[0];
      if (start) setDir(start.path);
    });
  }, []);

  useEffect(() => {
    if (!dir) return;
    setError(null);
    setPicked(new Set());
    fetch(`/api/browse?path=${encodeURIComponent(dir)}`).then((r) => r.json()).then((r) => {
      if (r.ok === false) setError(r.error);
      else {
        setListing(r);
        setTyped(r.path);
      }
    });
  }, [dir]);

  const join = (name) => `${listing.path.replace(/\/$/, "")}/${name}`;
  const files = listing?.entries.filter((e) => e.type === "file") || [];

  const run = async (fn) => {
    setBusy(true);
    try {
      setNotice(await fn());
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const importSelected = () => run(async () => summarize(await importPaths([...picked].map(join))));
  const importFolder = () => run(async () => summarize(await importPaths([listing.path])));
  const fromPicker = (e) => {
    const described = describeFileList(e.target.files);
    e.target.value = "";
    run(() => importDescribed(described));
  };

  const goTyped = (e) => {
    e.preventDefault();
    const p = typed.trim().replace(/^['"]|['"]$/g, "");
    if (!p) return;
    // a pasted file path: import it directly; a folder: open it
    fetch(`/api/browse?path=${encodeURIComponent(p)}`).then((r) => r.json()).then((r) => {
      if (r.ok === false) run(async () => summarize(await importPaths([p])));
      else setDir(r.path);
    });
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal import-dialog">
        <div className="panel-head">
          <h2>Import by path</h2>
          <span className="muted small">Files stay where they are. Nothing is uploaded or copied.</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="import-body">
          <nav className="places">
            {places.map((p) => (
              <button key={p.path + p.name} className={dir === p.path ? "on" : ""} onClick={() => setDir(p.path)} title={p.path}>
                {p.drive ? "⏏ " : p.recent ? "↺ " : ""}{p.name}
              </button>
            ))}
            <hr />
            <button onClick={() => fileInput.current.click()} title="Uses the system picker; the app then finds the files on disk">Choose files…</button>
            <button onClick={() => folderInput.current.click()}>Choose folder…</button>
            <input ref={fileInput} type="file" multiple hidden onChange={fromPicker} />
            <input ref={folderInput} type="file" webkitdirectory="" hidden onChange={fromPicker} />
          </nav>
          <div className="browser">
            <form className="pathbar" onSubmit={goTyped}>
              <button type="button" disabled={!listing?.parent} onClick={() => setDir(listing.parent)} title="Up one folder">↑</button>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Paste a path (Finder: ⌥⌘C copies it)" spellCheck={false} />
              <button type="submit">Go</button>
            </form>
            {error && <div className="err pad">{error}</div>}
            <ul className="listing">
              {listing?.entries.map((e) => (
                <li key={e.name} className={e.type} onDoubleClick={() => e.type === "dir" && setDir(join(e.name))}
                  onClick={() => {
                    if (e.type === "dir") return setDir(join(e.name));
                    const next = new Set(picked);
                    next.has(e.name) ? next.delete(e.name) : next.add(e.name);
                    setPicked(next);
                  }}>
                  {e.type === "dir" ? <span className="icon">📁</span> : <input type="checkbox" readOnly checked={picked.has(e.name)} />}
                  <span className="name">{e.name}</span>
                  {e.type === "file" && <span className="muted">{e.kind} · {fmtBytes(e.size)}</span>}
                </li>
              ))}
              {listing && !listing.entries.length && <li className="muted">No folders or media files here.</li>}
            </ul>
          </div>
        </div>
        <div className="modal-foot">
          {files.length > 0 && (
            <button onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.name)))}>
              {picked.size === files.length ? "Select none" : `Select all ${files.length}`}
            </button>
          )}
          <div className="spacer" />
          <button disabled={busy || !listing} onClick={importFolder} title="Everything in this folder and its subfolders">Import whole folder</button>
          <button className="primary" disabled={busy || !picked.size} onClick={importSelected}>
            {busy ? "Importing…" : `Import ${picked.size || ""} selected`}
          </button>
        </div>
      </div>
    </div>
  );
}
