// Fonts the editor can use, keyed by file name without extension
// (e.g. "AdvercaseFont-Bold"). The same file drives the browser preview and the ffmpeg export,
// so what you see is what renders.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_FONTS = path.resolve(here, "../../../brand-bible/brands/assets/fonts");

// System fonts worth offering when present. "Arial Rounded Bold" is the @blkgrlco label-card font.
const SYSTEM: [string, string[]][] = [
  ["Arial Rounded Bold", ["/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf", "/Library/Fonts/Arial Rounded Bold.ttf"]],
  ["Arial Bold", ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"]],
  ["Arial", ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"]],
  ["Helvetica", ["/System/Library/Fonts/Helvetica.ttc"]],
];
const DEFAULT_BOLD = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"];
const DEFAULT_REGULAR = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"];

const FONT_EXT = new Set([".otf", ".ttf", ".ttc"]);
const first = (list: string[]) => list.find((p) => fs.existsSync(p));

export type FontInfo = { key: string; file: string; source: string };
export function loadFonts(projectDir: string) {
  const fonts = new Map<string, FontInfo>();
  const addDir = (dir: string, source: string) => {
    if (!fs.existsSync(dir)) return;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!FONT_EXT.has(ext)) continue;
        const key = path.basename(e.name, path.extname(e.name));
        const prev = fonts.get(key);
        // Prefer .ttf (drawtext and every browser handle it); keep the first otherwise.
        if (!prev || (ext === ".ttf" && path.extname(prev.file) !== ".ttf")) fonts.set(key, { key, file: p, source });
      }
    };
    walk(dir);
  };
  addDir(path.join(projectDir, "fonts"), "project");
  addDir(REPO_FONTS, "brand");
  for (const [key, cands] of SYSTEM) {
    const f = first(cands);
    if (f && !fonts.has(key)) fonts.set(key, { key, file: f, source: "system" });
  }
  return fonts;
}

/** The font file a text style renders with. */
export function fontFileFor(fonts: Map<string, FontInfo>, style: { font?: string; bold?: boolean } = {}) {
  if (style.font && style.font !== "default" && fonts.has(style.font)) return fonts.get(style.font)!.file;
  return (first(style.bold === false ? DEFAULT_REGULAR : DEFAULT_BOLD) || first(DEFAULT_BOLD))!;
}
