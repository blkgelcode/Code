// What this Mac's ffmpeg can do, checked once at startup by actually trying it
// (an encoder can be listed but still fail, e.g. VideoToolbox inside some sandboxes).
import { run } from "./run";

export interface Caps { h264HW: boolean; hevcHW: boolean; proresHW: boolean; hwDecode: boolean; tonemap: boolean; encoders: string[] }
let cached: Promise<Caps> | null = null;

async function works(args: string[]) {
  try { await run("ffmpeg", ["-v", "error", "-hide_banner", ...args], { timeoutMs: 15000 }); return true; } catch { return false; }
}

export function capabilities(): Promise<Caps> {
  if (cached) return cached;
  cached = (async () => {
    const list = await run("ffmpeg", ["-hide_banner", "-encoders"]).catch(() => "");
    const encoders = [...list.matchAll(/^\s*V\S*\s+(\S+)/gm)].map((m) => m[1]);
    const test = (enc: string) => encoders.includes(enc)
      ? works(["-f", "lavfi", "-i", "testsrc2=s=320x240:d=0.2:r=30", "-c:v", enc, "-f", "null", "-"]) : Promise.resolve(false);
    const [h264HW, hevcHW, proresHW, tonemap] = await Promise.all([
      test("h264_videotoolbox"), test("hevc_videotoolbox"), test("prores_videotoolbox"),
      // a synthetic HLG frame (the test pattern has no colour info of its own, so declare it)
      works(["-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.1", "-vf", `format=yuv420p10le,${hdrToSdr("hlg")}format=yuv420p`, "-f", "null", "-"]),
    ]);
    const hwDecode = process.platform === "darwin" && await works(["-hwaccel", "videotoolbox", "-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.1", "-f", "null", "-"]);
    return { h264HW, hevcHW, proresHW, hwDecode, tonemap, encoders };
  })();
  return cached;
}

/**
 * HDR → SDR Rec.709 filter chain (ends with a comma). The input transfer, matrix and primaries
 * are stated explicitly rather than read from the file, since some phones and editors drop them.
 */
export function hdrToSdr(kind: "hlg" | "pq") {
  const trc = kind === "hlg" ? "arib-std-b67" : "smpte2084";
  return `setparams=color_primaries=bt2020:color_trc=${trc}:colorspace=bt2020nc:range=tv,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,`;
}
