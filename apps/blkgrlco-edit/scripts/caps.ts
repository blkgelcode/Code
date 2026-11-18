// Prints what this Mac's ffmpeg can do, and times a real 4K60 10-bit HEVC → proxy encode
// with the same settings the app uses. Used by run-mac-tests.command.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { capabilities } from "../server/media/caps";
import { run } from "../server/media/run";

const c = await capabilities();
console.log(`hardware H.264 encode (h264_videotoolbox): ${c.h264HW ? "✓" : "✗ (proxies and exports use software x264)"}`);
console.log(`hardware HEVC/ProRes encode: ${c.hevcHW ? "✓" : "✗"} / ${c.proresHW ? "✓" : "✗"}`);
console.log(`hardware decode (VideoToolbox): ${c.hwDecode ? "✓" : "✗"}`);
console.log(`HDR tone-mapping (zscale): ${c.tonemap ? "✓" : "✗ (iPhone HDR previews will look flat)"}`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blkedit-caps-"));
const src = path.join(dir, "4k60.mp4");
await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=3840x2160:d=10:r=60", "-c:v", c.hevcHW ? "hevc_videotoolbox" : "libx265", ...(c.hevcHW ? ["-b:v", "80M"] : ["-preset", "ultrafast"]), "-pix_fmt", c.hevcHW ? "p010le" : "yuv420p10le", "-tag:v", "hvc1", src]);
const enc = c.h264HW ? ["-c:v", "h264_videotoolbox", "-b:v", "4M", "-allow_sw", "1"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"];
const t0 = Date.now();
await run("ffmpeg", ["-v", "error", "-y", ...(c.hwDecode ? ["-hwaccel", "videotoolbox"] : []), "-i", src, "-vf", "scale=w=960:h=540:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p", "-r", "60", "-g", "60", "-force_key_frames", "expr:gte(t,n_forced*1)", ...enc, path.join(dir, "proxy.mp4")]);
const s = (Date.now() - t0) / 1000;
console.log(`proxy speed: 10 s of 4K60 10-bit HEVC in ${s.toFixed(1)} s (${(10 / s).toFixed(1)}× real time) with ${c.h264HW ? "hardware" : "software"} encoding`);
fs.rmSync(dir, { recursive: true, force: true });
