// What this machine's ffmpeg can do. On a Mac that's normally VideoToolbox:
// hardware HEVC/H.264 decoding and h264_videotoolbox encoding. Each is checked
// with a tiny real encode/decode, because "listed" doesn't always mean "works"
// (older Intel Macs, ffmpeg builds without VideoToolbox). Anything missing falls
// back to software (libx264).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
let cached = null;

async function works(args) {
  try {
    await run("ffmpeg", ["-hide_banner", "-v", "error", ...args], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

export async function detectHardware() {
  if (cached) return cached;
  const force = process.env.TIMELINE_SOFTWARE === "1"; // escape hatch if hardware misbehaves
  let encoders = "";
  let hwaccels = "";
  try {
    encoders = (await run("ffmpeg", ["-hide_banner", "-encoders"])).stdout;
    hwaccels = (await run("ffmpeg", ["-hide_banner", "-hwaccels"])).stdout;
  } catch {
    // ffmpeg missing: everything will fail with a clear per-clip error later
  }
  const listedEnc = /\bh264_videotoolbox\b/.test(encoders);
  const listedDec = /\bvideotoolbox\b/.test(hwaccels);
  const encoder = !force && listedEnc && (await works(["-f", "lavfi", "-i", "testsrc2=s=320x240:d=0.2", "-c:v", "h264_videotoolbox", "-f", "null", "-"]))
    ? "h264_videotoolbox" : "libx264";
  const decode = !force && listedDec && (await works(["-hwaccel", "videotoolbox", "-f", "lavfi", "-i", "testsrc2=s=320x240:d=0.2", "-f", "null", "-"]))
    ? "videotoolbox" : null;
  cached = { encoder, decode };
  return cached;
}

/** Arguments to put before an `-i` for hardware decoding (empty when unavailable). */
export const decodeArgs = (hw) => (hw?.decode ? ["-hwaccel", hw.decode] : []);

/**
 * Video encoder arguments.
 * quality "proxy": small and fast; "master": full-quality export.
 */
export function encodeArgs(hw, { quality, width, height, fps, keyframeSec }) {
  const gop = keyframeSec ? Math.max(1, Math.round(fps * keyframeSec)) : null;
  const key = gop ? ["-g", String(gop), "-force_key_frames", `expr:gte(t,n_forced*${keyframeSec})`] : [];
  if (hw?.encoder === "h264_videotoolbox") {
    // VideoToolbox is bitrate-driven: pick a bitrate from the pixel rate
    const pixelsPerSec = width * height * fps;
    const bps = quality === "proxy"
      ? Math.max(1.5e6, Math.min(4e6, pixelsPerSec * 0.07))
      : Math.max(12e6, Math.min(150e6, pixelsPerSec * 0.2));
    return ["-c:v", "h264_videotoolbox", "-b:v", String(Math.round(bps)), "-maxrate", String(Math.round(bps * 1.5)),
      "-profile:v", "high", "-allow_sw", "1", ...key, "-pix_fmt", "yuv420p"];
  }
  return quality === "proxy"
    ? ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", "26", ...key, "-pix_fmt", "yuv420p"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "16", ...key, "-pix_fmt", "yuv420p"];
}
