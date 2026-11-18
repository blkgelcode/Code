import React, { useEffect, useState } from "react";
import { fmtClock } from "../lib/format.js";

const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

/** Named versions plus the automatic snapshots. Restoring is a normal change: ⌘Z takes it back. */
export default function Versions({ onClose, setNotice }) {
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const load = () => fetch("/api/versions").then((r) => r.json()).then(setList);
  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const r = await post("/api/versions", { name: name.trim() || "Version" });
    if (!r.ok) return setNotice(r.error);
    setName("");
    load();
  };
  const restore = async (v) => {
    const r = await post("/api/versions/restore", { id: v.id });
    if (!r.ok) return setNotice(r.error);
    setNotice(`Restored "${v.name}". Undo (⌘Z) takes it back.`);
    onClose();
  };

  const day = (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal versions">
        <div className="panel-head">
          <h2>Versions</h2>
          <span className="muted small">Every change saves itself. Autosaves are kept every 5 minutes; name a version to find it easily.</span>
          <button onClick={onClose}>✕</button>
        </div>
        <form className="pathbar" onSubmit={save}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Name this version, e.g. "before rough cut"' />
          <button className="primary" type="submit">Save version</button>
        </form>
        <ul className="listing">
          {list.map((v) => (
            <li key={v.id} className="file">
              <span className={`badge-kind ${v.kind}`}>{v.kind === "version" ? "★" : "⏱"}</span>
              <span className="name">{v.name}</span>
              <span className="muted">{day(v.ts)} {fmtClock(v.ts)}{v.author ? ` · ${v.author === "user" ? "you" : v.author}` : ""}</span>
              <button onClick={() => restore(v)}>Restore</button>
            </li>
          ))}
          {!list.length && <li className="muted">No versions yet.</li>}
        </ul>
      </div>
    </div>
  );
}
