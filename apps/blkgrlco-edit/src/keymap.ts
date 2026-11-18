// Keyboard shortcuts: presets (BLKGRLCO default, Premiere Pro, Final Cut Pro) plus her own
// overrides, saved in this Mac's app storage. A binding is a string like "mod+shift+k", "alt+left",
// "space", ",", "shift+backspace". "mod" is ⌘ on the Mac (Ctrl elsewhere).

export type Preset = "blkgrlco" | "premiere" | "fcp";
export type Bindings = Record<string, string[]>; // command id → keys

// What the app can do, for the shortcut editor and ⌘K palette (labels are what she reads).
export const COMMANDS: { id: string; label: string; group: string }[] = [
  // playback
  { id: "play", label: "Play / pause", group: "Playback" },
  { id: "shuttle-fwd", label: "Play forward (again for faster)", group: "Playback" },
  { id: "shuttle-back", label: "Play backward (again for faster)", group: "Playback" },
  { id: "stop", label: "Stop (hold with J/L to creep)", group: "Playback" },
  { id: "frame-back", label: "Back one frame", group: "Playback" },
  { id: "frame-fwd", label: "Forward one frame", group: "Playback" },
  { id: "second-back", label: "Back one second", group: "Playback" },
  { id: "second-fwd", label: "Forward one second", group: "Playback" },
  { id: "go-start", label: "Go to start", group: "Playback" },
  { id: "go-end", label: "Go to end", group: "Playback" },
  { id: "prev-edit", label: "Previous edit point", group: "Playback" },
  { id: "next-edit", label: "Next edit point", group: "Playback" },
  { id: "go-timecode", label: "Go to timecode…", group: "Playback" },
  // marking & three-point editing
  { id: "mark-in", label: "Mark In", group: "Marking" },
  { id: "mark-out", label: "Mark Out", group: "Marking" },
  { id: "mark-clip", label: "Mark the clip under the playhead", group: "Marking" },
  { id: "clear-in", label: "Clear In", group: "Marking" },
  { id: "clear-out", label: "Clear Out", group: "Marking" },
  { id: "clear-marks", label: "Clear In and Out", group: "Marking" },
  { id: "insert", label: "Insert source at playhead (pushes later clips)", group: "Edit" },
  { id: "overwrite", label: "Overwrite source at playhead", group: "Edit" },
  { id: "append", label: "Append source to the end", group: "Edit" },
  { id: "replace", label: "Replace selected clip with source", group: "Edit" },
  { id: "lift", label: "Lift In→Out (leave a gap)", group: "Edit" },
  { id: "extract", label: "Extract In→Out (close the gap)", group: "Edit" },
  { id: "split", label: "Split at playhead (add edit)", group: "Edit" },
  { id: "split-all", label: "Split all tracks at playhead", group: "Edit" },
  { id: "delete", label: "Delete (leave gap)", group: "Edit" },
  { id: "ripple-delete", label: "Ripple delete (close gap)", group: "Edit" },
  { id: "close-gap", label: "Close gap at playhead", group: "Edit" },
  { id: "close-all-gaps", label: "Close all gaps on the track", group: "Edit" },
  { id: "ripple-trim-prev", label: "Ripple trim start to playhead", group: "Edit" },
  { id: "ripple-trim-next", label: "Ripple trim end to playhead", group: "Edit" },
  { id: "nudge-left", label: "Nudge left 1 frame", group: "Edit" },
  { id: "nudge-right", label: "Nudge right 1 frame", group: "Edit" },
  { id: "nudge-left-5", label: "Nudge left 5 frames", group: "Edit" },
  { id: "nudge-right-5", label: "Nudge right 5 frames", group: "Edit" },
  { id: "link", label: "Link / unlink picture and sound", group: "Edit" },
  { id: "linked-selection", label: "Linked selection on/off", group: "Edit" },
  { id: "nest", label: "Nest selection (compound clip)", group: "Edit" },
  { id: "add-text", label: "Add text at playhead", group: "Edit" },
  { id: "undo", label: "Undo", group: "Edit" },
  { id: "redo", label: "Redo", group: "Edit" },
  // clipboard
  { id: "copy", label: "Copy", group: "Clipboard" },
  { id: "cut", label: "Cut", group: "Clipboard" },
  { id: "paste", label: "Paste (overwrite at playhead)", group: "Clipboard" },
  { id: "paste-insert", label: "Paste insert", group: "Clipboard" },
  { id: "paste-attributes", label: "Paste attributes (volume, fades, fit, style)", group: "Clipboard" },
  { id: "select-all", label: "Select all", group: "Clipboard" },
  { id: "deselect", label: "Deselect", group: "Clipboard" },
  { id: "match-frame", label: "Match frame (open source at this frame)", group: "Clipboard" },
  { id: "reveal", label: "Reveal in bin", group: "Clipboard" },
  // markers
  { id: "marker", label: "Add marker", group: "Markers" },
  { id: "marker-claude", label: "Add note for Claude", group: "Markers" },
  { id: "marker-chapter", label: "Add chapter marker", group: "Markers" },
  { id: "marker-clip", label: "Add marker on the selected clip", group: "Markers" },
  { id: "prev-marker", label: "Previous marker", group: "Markers" },
  { id: "next-marker", label: "Next marker", group: "Markers" },
  { id: "copy-chapters", label: "Copy YouTube chapters", group: "Markers" },
  // tools
  { id: "tool-select", label: "Selection tool", group: "Tools" },
  { id: "tool-forward", label: "Track select forward tool", group: "Tools" },
  { id: "tool-ripple", label: "Ripple edit tool", group: "Tools" },
  { id: "tool-roll", label: "Rolling edit tool", group: "Tools" },
  { id: "tool-blade", label: "Blade (razor) tool", group: "Tools" },
  { id: "tool-slip", label: "Slip tool", group: "Tools" },
  { id: "tool-slide", label: "Slide tool", group: "Tools" },
  { id: "tool-hand", label: "Hand tool", group: "Tools" },
  { id: "tool-zoom", label: "Zoom tool", group: "Tools" },
  // view & project
  { id: "snap", label: "Snapping on/off", group: "View" },
  { id: "zoom-in", label: "Zoom in", group: "View" },
  { id: "zoom-out", label: "Zoom out", group: "View" },
  { id: "zoom-fit", label: "Zoom to fit", group: "View" },
  { id: "palette", label: "Command palette", group: "View" },
  { id: "shortcuts", label: "Keyboard shortcuts…", group: "View" },
  { id: "new-sequence", label: "New sequence…", group: "Project" },
  { id: "duplicate-version", label: "Duplicate sequence as new version", group: "Project" },
  { id: "rename-sequence", label: "Rename sequence…", group: "Project" },
  { id: "import", label: "Import files…", group: "Project" },
  { id: "export", label: "Export MP4", group: "Project" },
];

const shared: Bindings = {
  play: ["space"], "shuttle-fwd": ["l"], "shuttle-back": ["j"], stop: ["k"],
  "frame-back": ["left"], "frame-fwd": ["right"], "second-back": ["shift+left"], "second-fwd": ["shift+right"],
  "go-start": ["home"], "go-end": ["end"], "prev-edit": ["up"], "next-edit": ["down"],
  "mark-in": ["i"], "mark-out": ["o"], "clear-in": ["alt+i"], "clear-out": ["alt+o"], "clear-marks": ["alt+x"],
  delete: ["backspace", "delete"], "ripple-delete": ["shift+backspace", "shift+delete"],
  "nudge-left": ["alt+left"], "nudge-right": ["alt+right"], "nudge-left-5": ["alt+shift+left"], "nudge-right-5": ["alt+shift+right"],
  "zoom-in": ["=", "shift+="], "zoom-out": ["-"], "zoom-fit": ["shift+z"],
  undo: ["mod+z"], redo: ["mod+shift+z"], copy: ["mod+c"], cut: ["mod+x"], paste: ["mod+v"], "paste-insert": ["mod+shift+v"],
  "paste-attributes": ["mod+alt+v"], "select-all": ["mod+a"], deselect: ["escape"],
  import: ["mod+i"], export: ["mod+e"], "go-timecode": ["mod+j"],
};

export const PRESETS: Record<Preset, { name: string; bindings: Bindings }> = {
  blkgrlco: {
    name: "BLKGRLCO (Premiere-style, S splits)",
    bindings: {
      ...shared,
      insert: [","], overwrite: ["."], append: ["shift+e"], replace: ["shift+r"], lift: [";"], extract: ["'"],
      "mark-clip": ["x"], split: ["s", "mod+k"], "split-all": ["mod+shift+k"], "close-gap": ["alt+backspace"],
      "ripple-trim-prev": ["q"], "ripple-trim-next": ["w"], link: ["mod+l"], "linked-selection": ["mod+shift+l"], nest: ["alt+g"],
      "add-text": ["t"], "match-frame": ["f"], reveal: ["shift+f"],
      marker: ["m"], "marker-claude": ["shift+c"], "marker-chapter": ["shift+h"], "marker-clip": ["alt+m"], "prev-marker": ["shift+m"], "next-marker": ["mod+shift+m"],
      "tool-select": ["v"], "tool-forward": ["a"], "tool-ripple": ["b"], "tool-roll": ["n"], "tool-blade": ["c"],
      "tool-slip": ["y"], "tool-slide": ["u"], "tool-hand": ["h"], "tool-zoom": ["z"],
      snap: ["shift+s"], palette: ["mod+p"], shortcuts: ["mod+alt+k"], "duplicate-version": ["mod+shift+d"],
    },
  },
  premiere: {
    name: "Premiere Pro",
    bindings: {
      ...shared,
      insert: [","], overwrite: ["."], replace: ["shift+r"], lift: [";"], extract: ["'"], "mark-clip": ["x"],
      split: ["mod+k"], "split-all": ["mod+shift+k"], "ripple-trim-prev": ["q"], "ripple-trim-next": ["w"],
      link: ["mod+l"], "linked-selection": ["mod+shift+l"], nest: ["alt+g"], "add-text": ["mod+t"],
      "match-frame": ["f"], reveal: ["shift+f"], marker: ["m"], "marker-claude": ["shift+c"], "marker-clip": ["alt+m"], "prev-marker": ["mod+shift+m"], "next-marker": ["shift+m"],
      "tool-select": ["v"], "tool-forward": ["a"], "tool-ripple": ["b"], "tool-roll": ["n"], "tool-blade": ["c"],
      "tool-slip": ["y"], "tool-slide": ["u"], "tool-hand": ["h"], "tool-zoom": ["z"],
      snap: ["s"], palette: ["mod+shift+p"], shortcuts: ["mod+alt+k"],
    },
  },
  fcp: {
    name: "Final Cut Pro",
    bindings: {
      ...shared,
      insert: ["w"], overwrite: ["d"], append: ["e"], replace: ["shift+r"], "mark-clip": ["x"],
      split: ["mod+b"], "split-all": ["mod+shift+b"], "ripple-trim-prev": ["alt+["], "ripple-trim-next": ["alt+]"],
      link: ["mod+l"], nest: ["alt+g"], "add-text": ["mod+t"], "match-frame": ["shift+f"], reveal: ["mod+shift+r"],
      marker: ["m"], "marker-claude": ["shift+c"], "prev-marker": ["ctrl+;"], "next-marker": ["ctrl+'"],
      "tool-select": ["a"], "tool-blade": ["b"], "tool-ripple": ["t"], "tool-roll": ["shift+t"], "tool-slip": ["y"], "tool-slide": ["u"],
      "tool-hand": ["h"], "tool-zoom": ["z"], "tool-forward": ["shift+a"],
      snap: ["n"], palette: ["mod+k"], shortcuts: ["mod+alt+k"], "prev-edit": ["up", ";"], "next-edit": ["down", "'"],
    },
  },
};

const KEYNAMES: Record<string, string> = { " ": "space", arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down", esc: "escape" };

/** The binding string for a key event ("mod+shift+k"). */
export function eventKey(e: KeyboardEvent): string {
  let k = e.key.toLowerCase();
  k = KEYNAMES[k] || k;
  // with Alt on a Mac, e.key is a special character (⌥i → ˆ); use the physical key instead
  if (e.code.startsWith("Key")) k = e.code.slice(3).toLowerCase();
  else if (e.code.startsWith("Digit")) k = e.code.slice(5);
  else if (e.code === "Comma") k = ","; else if (e.code === "Period") k = "."; else if (e.code === "Semicolon") k = ";";
  else if (e.code === "Quote") k = "'"; else if (e.code === "Equal") k = "="; else if (e.code === "Minus") k = "-";
  else if (e.code === "BracketLeft") k = "["; else if (e.code === "BracketRight") k = "]"; else if (e.code === "Slash") k = "/";
  const parts = [];
  if (e.metaKey || (e.ctrlKey && !isMac())) parts.push("mod");
  if (e.ctrlKey && isMac()) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (["meta", "control", "alt", "shift"].includes(k)) return parts.join("+");
  parts.push(k);
  return parts.join("+");
}
export const isMac = () => typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);

const SYMBOLS: Record<string, string> = { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", left: "←", right: "→", up: "↑", down: "↓", backspace: "⌫", delete: "⌦", escape: "Esc", space: "Space", home: "Home", end: "End" };
export function keyLabel(k: string): string {
  return k.split("+").map((p) => SYMBOLS[p] || (p.length === 1 ? p.toUpperCase() : p)).join("");
}

const STORE = "blkedit.keys";
export interface KeySettings { preset: Preset; custom: Bindings }
export function loadKeys(): KeySettings {
  try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && PRESETS[s.preset as Preset]) return { preset: s.preset, custom: s.custom || {} }; } catch { /* */ }
  return { preset: "blkgrlco", custom: {} };
}
export function saveKeys(s: KeySettings) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* */ } }

/** Effective bindings: the preset, with her changes on top. */
export function effective(s: KeySettings): Bindings {
  return { ...PRESETS[s.preset].bindings, ...s.custom };
}
/** key → command, for dispatch. Later commands don't steal a key an earlier custom binding took. */
export function keyIndex(b: Bindings): Map<string, string> {
  const m = new Map<string, string>();
  for (const [cmd, keys] of Object.entries(b)) for (const k of keys) if (!m.has(k)) m.set(k, cmd);
  return m;
}
/** Commands already using a key (to warn in the editor). */
export const conflicts = (b: Bindings, key: string, except: string) => Object.entries(b).filter(([c, ks]) => c !== except && ks.includes(key)).map(([c]) => c);
