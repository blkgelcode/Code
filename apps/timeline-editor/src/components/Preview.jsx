import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clipLength, clipEnd, isTextClip, mediaById } from "../lib/model.js";
import { mediaState } from "../lib/format.js";

const PRELOAD = 2; // seconds: mount clips a little before they start so they're ready

function fadeFactor(clip, t) {
  const len = clipLength(clip);
  const local = t - clip.start;
  let a = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) a = Math.min(a, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > len - clip.fadeOut) a = Math.min(a, (len - local) / clip.fadeOut);
  return Math.max(0, Math.min(1, a));
}

export default function Preview({ timeline, time, playing, mediaStatus = {}, quality = "proxy" }) {
  const stage = useRef(null);
  const [scale, setScale] = useState(0.3);

  useLayoutEffect(() => {
    if (!stage.current || !timeline) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / timeline.settings.width));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [timeline?.settings.width, timeline]);

  if (!timeline) return <section className="preview"><div className="empty">Waiting for the server…</div></section>;
  const { width: W, height: H, background } = timeline.settings;

  // tracks lower in the list are underneath: give each track a z-index by position
  const layers = [];
  timeline.tracks.forEach((track, i) => {
    const z = timeline.tracks.length - i;
    for (const clip of track.clips) {
      const near = time >= clip.start - PRELOAD && time < clipEnd(clip);
      if (!near) continue;
      const active = time >= clip.start && time < clipEnd(clip);
      if (isTextClip(clip)) {
        if (active && !track.hidden) layers.push(<TextLayer key={clip.id} clip={clip} z={z} scale={scale} alpha={fadeFactor(clip, time)} />);
      } else {
        const m = mediaById(timeline, clip.media);
        if (m) layers.push(<MediaLayer key={`${clip.id}:${quality}`} clip={clip} track={track} media={m} z={z} time={time} playing={playing} active={active} status={mediaStatus[m.id]} quality={quality} />);
      }
    }
  });

  return (
    <section className="preview">
      <div className="stage-wrap">
        <div className="stage" ref={stage} style={{ aspectRatio: `${W} / ${H}`, background }}>
          {layers}
        </div>
      </div>
      <div className="preview-foot muted">
        {W}×{H} · {timeline.settings.fps}fps · previewing {quality === "proxy" ? "960×540 proxies" : "original files"} · export always uses the originals at full quality
      </div>
    </section>
  );
}

function MediaLayer({ clip, track, media, z, time, playing, active, status, quality }) {
  const el = useRef(null);
  const [failed, setFailed] = useState(false);
  const isImage = media.kind === "image";
  const showPicture = track.kind === "video" && media.kind !== "audio" && !track.hidden && active;
  const st = mediaState(status);
  const proxyOk = status?.ready;
  const offline = status?.online === false;
  // proxy mode needs the proxy (it plays even while the drive is unplugged);
  // full mode needs the original file to be online
  const playable = quality === "full" ? !offline : proxyOk || isImage || (media.kind === "audio" && !offline);
  const src = `/preview/${media.id}?q=${quality}&k=${status?.key || ""}`;

  useEffect(() => setFailed(false), [src]);

  useEffect(() => {
    const v = el.current;
    if (!v || isImage) return;
    const expected = clip.in + (time - clip.start);
    if (!active) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - clip.in) > 0.05 && v.readyState > 0) v.currentTime = clip.in;
      return;
    }
    const vol = (clip.volume ?? 1) * (track.volume ?? 1) * fadeFactor(clip, time);
    v.volume = Math.max(0, Math.min(1, vol));
    v.muted = track.muted;
    if (playing) {
      if (v.paused) {
        v.currentTime = expected;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - expected) > 0.3) {
        v.currentTime = expected;
      }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - expected) > 0.02) v.currentTime = expected;
    }
  });

  const style = {
    zIndex: z,
    opacity: showPicture ? fadeFactor(clip, time) : 0,
    objectFit: clip.fit === "contain" ? "contain" : "cover",
  };
  const name = media.file.split("/").pop();
  const message = (text) => showPicture && <div className="layer layer-msg" style={{ zIndex: z }}>{text}</div>;

  if (!playable) {
    if (offline) return message(`${name} is offline. Reconnect its drive.`);
    return message(st.error ? `${name}: ${st.label}` : `${name}: preparing preview (${st.label.toLowerCase()})`);
  }
  if (isImage) return <img className="layer" src={src} style={style} alt="" />;
  if (media.kind === "audio") return <audio ref={el} src={src} preload="auto" onError={() => setFailed(true)} />;
  return (
    <>
      <video ref={el} className="layer" src={src} style={style} preload="auto" playsInline onError={() => setFailed(true)} />
      {failed && message(quality === "full"
        ? `The browser can't play the original ${name} (common for HEVC 10-bit). Switch to Proxy.`
        : `${name}: the preview couldn't load.`)}
    </>
  );
}

function TextLayer({ clip, z, scale, alpha }) {
  const s = clip.style;
  const tx = s.align === "left" ? "0" : s.align === "right" ? "-100%" : "-50%";
  const style = {
    zIndex: z,
    left: `${s.x * 100}%`,
    top: `${s.y * 100}%`,
    transform: `translate(${tx}, -50%)`,
    fontSize: s.size * scale,
    color: s.color,
    fontFamily: `"${s.font}", sans-serif`,
    textAlign: s.align,
    opacity: alpha,
  };
  if (s.box) {
    const op = s.box.opacity ?? 0.5;
    const hex = (s.box.color || "#000000").replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    style.background = `rgba(${r},${g},${b},${op})`;
    style.padding = (s.box.padding ?? 20) * scale;
  }
  return <div className="text-layer" style={style}>{clip.text}</div>;
}
