// BLKGRLCO Studios presets, read from the brand bible in this repo.
//
// Color pipeline (brand bible order): base correction → conversion LUT (D-Log M →
// Rec.709, for DJI footage) → creative look (the channel's LUT) → finishing.
import fs from "node:fs";
import path from "node:path";
import { REPO_DIR } from "./store.js";

const LUTS = path.join(REPO_DIR, "brand-bible", "brands", "assets", "luts");

export const DLOGM_LUT = path.join(LUTS, "dji-pocket3", "DJI_OSMO_Pocket_3_D-Log_M_to_Rec.709_V1.cube");
export const EVERYDAY_LUT = path.join(LUTS, "blkgrlco", "The Everyday LUT.cube");

/** The creative look each channel uses by default (null = none). */
export const CHANNEL_LOOKS = {
  "@blkgrlco": { name: "The Everyday LUT", file: EVERYDAY_LUT },
  "@blkgrlcotakesoff": { name: "The Everyday LUT", file: EVERYDAY_LUT },
  podcast: null,
};

/** DJI names its files DJI_YYYYMMDDhhmmss_NNNN_D…; it also mis-tags D-Log M as bt709. */
const DJI_NAME = /^DJI_\d{14}_\d{4}_D/i;
const DJI_OLD = /^DJI_\d{4}\./i;

/**
 * Is this probably D-Log M footage? Same rule as BLKGRLCO Bin: DJI camera files
 * get the conversion by default, and the per-media switch overrides it.
 */
export function guessLogProfile(file, formatTags = {}) {
  const name = path.basename(file);
  const tagged = Object.values(formatTags || {}).some((v) => /\bDJI\b/i.test(String(v)));
  return DJI_NAME.test(name) || DJI_OLD.test(name) || tagged ? "dlogm" : "none";
}

/**
 * The creative LUT file for a project, or null.
 * project.look: "channel" (the channel's default), "none", or a path to a .cube.
 */
export function projectLook(project) {
  const look = project?.look ?? "channel";
  if (look === "none") return null;
  if (look === "channel") return CHANNEL_LOOKS[project?.channel]?.file ?? null;
  const p = path.isAbsolute(look) ? look : path.join(REPO_DIR, look);
  return fs.existsSync(p) ? p : null;
}

export function lutsAvailable() {
  return { dlogm: fs.existsSync(DLOGM_LUT), everyday: fs.existsSync(EVERYDAY_LUT) };
}
