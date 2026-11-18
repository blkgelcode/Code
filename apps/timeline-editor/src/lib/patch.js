// Change records for undo/redo: a JSON-Patch-like format that addresses items in
// lists by their id, not their position, so an old change can still be undone
// after other tracks or clips were added or reordered around it.
//
// Path segments are object keys, list positions, or "@id:<id>" for an item with
// that id. Operations:
//   { op: "replace", path, value }        set a value
//   { op: "add", path, value }            add an object key
//   { op: "remove", path }                remove an object key or an id'd list item
//   { op: "insert", path, index, value }  put an id'd item into the list at `path`
//   { op: "order", path, ids }            reorder the id'd items of the list at `path`
//
// diff(a, b) returns the operations that turn a into b.

const esc = (k) => String(k).replace(/~/g, "~0").replace(/\//g, "~1");
const unesc = (k) => k.replace(/~1/g, "/").replace(/~0/g, "~");
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const idList = (arr) => arr.length > 0 && arr.every((x) => isObj(x) && typeof x.id === "string") && new Set(arr.map((x) => x.id)).size === arr.length;
const ID = "@id:";

export function diff(a, b, path = "", ops = []) {
  if (same(a, b)) return ops;
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) ops.push({ op: "remove", path: `${path}/${esc(k)}` });
    for (const k of Object.keys(b)) {
      if (!(k in a)) ops.push({ op: "add", path: `${path}/${esc(k)}`, value: copy(b[k]) });
      else diff(a[k], b[k], `${path}/${esc(k)}`, ops);
    }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b) && (idList(a) || a.length === 0) && (idList(b) || b.length === 0) && (a.length || b.length)) {
    const aIds = a.map((x) => x.id);
    const bIds = b.map((x) => x.id);
    const bSet = new Set(bIds);
    const aSet = new Set(aIds);
    for (const id of aIds) if (!bSet.has(id)) ops.push({ op: "remove", path: `${path}/${ID}${esc(id)}` });
    b.forEach((x, i) => {
      if (!aSet.has(x.id)) ops.push({ op: "insert", path, index: i, value: copy(x) });
    });
    const keptA = aIds.filter((id) => bSet.has(id));
    const keptB = bIds.filter((id) => aSet.has(id));
    if (keptA.join("\u0000") !== keptB.join("\u0000")) ops.push({ op: "order", path, ids: bIds });
    for (const x of b) {
      const old = a.find((y) => y.id === x.id);
      if (old) diff(old, x, `${path}/${ID}${esc(x.id)}`, ops);
    }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && !a.some(isObj)) {
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}/${i}`, ops);
    return ops;
  }
  ops.push({ op: "replace", path, value: copy(b) });
  return ops;
}

function locate(root, keys, opPath) {
  let node = root;
  for (const k of keys) {
    if (Array.isArray(node) && k.startsWith(ID)) {
      const id = k.slice(ID.length);
      node = node.find((x) => x?.id === id);
    } else if (node !== null && typeof node === "object" && k in node) {
      node = node[k];
    } else node = undefined;
    if (node === undefined) throw new Error(`path ${opPath} not found`);
  }
  return node;
}

/** Apply operations to a copy of `doc`. Throws if a path doesn't exist. */
export function apply(doc, ops) {
  let root = copy(doc);
  for (const o of ops) {
    const keys = o.path === "" ? [] : o.path.split("/").slice(1).map(unesc);
    if (o.op === "insert" || o.op === "order") {
      const list = locate(root, keys, o.path);
      if (!Array.isArray(list)) throw new Error(`${o.path} is not a list`);
      if (o.op === "insert") {
        if (list.some((x) => x?.id === o.value.id)) throw new Error(`${o.value.id} is already there`);
        list.splice(Math.min(o.index, list.length), 0, copy(o.value));
      } else {
        const pos = new Map(o.ids.map((id, i) => [id, i]));
        list.sort((x, y) => (pos.get(x.id) ?? Infinity) - (pos.get(y.id) ?? Infinity));
      }
      continue;
    }
    if (!keys.length) {
      if (o.op === "remove") throw new Error("can't remove the root");
      root = copy(o.value);
      continue;
    }
    const last = keys.pop();
    const parent = locate(root, keys, o.path);
    if (Array.isArray(parent)) {
      const i = last.startsWith(ID) ? parent.findIndex((x) => x?.id === last.slice(ID.length)) : Number(last);
      if (i < 0 || i >= parent.length) throw new Error(`path ${o.path} not found`);
      if (o.op === "remove") parent.splice(i, 1);
      else parent[i] = copy(o.value);
    } else {
      if (o.op !== "add" && !(last in parent)) throw new Error(`path ${o.path} not found`);
      if (o.op === "remove") delete parent[last];
      else parent[last] = copy(o.value);
    }
  }
  return root;
}

/** The paths an operation touches (an insert touches the new item's path). */
function touched(o) {
  if (o.op === "insert") return [`${o.path}/${ID}${esc(o.value.id)}`];
  return [o.path];
}

/** Do two sets of operations touch overlapping parts of the document? */
export function overlaps(opsA, opsB) {
  const hit = (p, q) => p === q || p.startsWith(`${q}/`) || q.startsWith(`${p}/`) || p === "" || q === "";
  return opsA.some((a) => opsB.some((b) => touched(a).some((p) => touched(b).some((q) => hit(p, q)))));
}
