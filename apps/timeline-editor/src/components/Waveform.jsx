import React, { useEffect, useRef, useState } from "react";

// one fetch per media file (and cache key), shared by every clip that uses it
const cache = new Map();
function loadPeaks(mediaId, key) {
  const k = `${mediaId}:${key}`;
  if (!cache.has(k)) {
    cache.set(k, fetch(`/wave/${mediaId}?k=${key}`).then((r) => (r.ok ? r.json() : { rate: 50, peaks: [] })).catch(() => ({ rate: 50, peaks: [] })));
  }
  return cache.get(k);
}

/** Draws the part of a media file's waveform between `from` and `to` seconds. */
export default function Waveform({ mediaId, cacheKey, from, to, width, height, color = "rgba(255,255,255,0.55)" }) {
  const canvas = useRef(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    loadPeaks(mediaId, cacheKey).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [mediaId, cacheKey]);

  const w = Math.max(1, Math.min(4096, Math.round(width))); // canvases have a size limit; CSS stretches the rest
  useEffect(() => {
    const c = canvas.current;
    if (!c || !data?.peaks.length) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = color;
    const { rate, peaks } = data;
    const span = (to - from) * rate;
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(from * rate + (x / w) * span);
      const b = Math.max(a + 1, Math.floor(from * rate + ((x + 1) / w) * span));
      let m = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      const h = Math.max(1, (m / 255) * (height - 2));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [data, from, to, w, height, color]);

  return <canvas ref={canvas} className="wave" width={w} height={height} style={{ width: "100%", height }} />;
}
