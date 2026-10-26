"""Thumbnail checks and a click-appeal score (0-100).

Local checks (numpy + Pillow, always run):
  - bottom-right corner: is something busy where YouTube puts the video length?
  - clutter: how busy the image is at phone size (168x94, search results)
  - red-green colorblind: do areas that differ only by red vs green blend together?
Checks that need to read the image (Claude vision):
  - words on the thumbnail (more than 5?) and whether they're readable when small
  - where the face is (centered?)
  - a base appeal rating

The score is a set of rules, not a click-rate predictor: base appeal minus a
penalty for each failed check. It ranks your options against each other.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1280, 720
PHONE = (168, 94)          # YouTube search / suggested on a phone
CORNER = (0.84, 0.85)      # left/top edge of the timestamp zone, as a fraction of width/height

PENALTY = {"corner": 15, "clutter": 15, "words": 10, "readable": 10, "colorblind": 10, "face": 10}

# Machado et al. 2009, severity 1.0, applied in linear RGB.
CVD = {
    "deutan": np.array([[0.367322, 0.860646, -0.227968],
                        [0.280085, 0.672501, 0.047413],
                        [-0.011820, 0.042940, 0.968881]]),
    "protan": np.array([[0.152286, 1.052583, -0.204868],
                        [0.114503, 0.786281, 0.099216],
                        [-0.003882, -0.048116, 1.051998]]),
}


# ---- image helpers -------------------------------------------------------------

def load(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    if abs(im.width / im.height - W / H) < 0.02:
        return im.resize((W, H), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (0, 0, 0))  # not 16:9: fit inside, like YouTube does
    im.thumbnail((W, H), Image.LANCZOS)
    canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    return canvas


def to_linear(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(lin: np.ndarray) -> np.ndarray:
    lin = np.clip(lin, 0, 1)
    c = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.clip(c * 255, 0, 255)


def simulate(im: Image.Image, kind: str = "deutan") -> Image.Image:
    arr = np.asarray(im, dtype=np.float64)
    out = to_srgb(to_linear(arr) @ CVD[kind].T)
    return Image.fromarray(out.astype(np.uint8))


def lab(rgb: np.ndarray) -> np.ndarray:
    lin = to_linear(rgb)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def luminance(rgb: np.ndarray) -> np.ndarray:
    return to_linear(rgb) @ np.array([0.2126, 0.7152, 0.0722])


def edge_density(gray: np.ndarray, thresh: float) -> float:
    gx = np.abs(np.diff(gray, axis=1))[:-1, :]
    gy = np.abs(np.diff(gray, axis=0))[:, :-1]
    return float(((gx + gy) > thresh).mean())


def kmeans(x: np.ndarray, k: int = 5, iters: int = 12) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(0)  # deterministic: same image, same score
    centers = x[rng.choice(len(x), size=min(k, len(x)), replace=False)]
    for _ in range(iters):
        labels = np.argmin(((x[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        for j in range(len(centers)):
            pts = x[labels == j]
            if len(pts):
                centers[j] = pts.mean(0)
    return centers, labels


# ---- checks -----------------------------------------------------------------------

def check_corner(im: Image.Image, facts: dict | None) -> dict:
    x0, y0 = int(W * CORNER[0]), int(H * CORNER[1])
    gray = np.asarray(im.convert("L"), dtype=np.float64) / 255
    busy = edge_density(gray[y0:, x0:], 0.12)
    overall = edge_density(gray, 0.12)
    hits = []
    for t in (facts or {}).get("texts", []):
        if _overlaps(t, CORNER):
            hits.append(f'text "{t.get("text", "")}"')
    for f in (facts or {}).get("faces", []):
        if _overlaps(f, CORNER):
            hits.append("a face")
    # busier than the picture as a whole: likely text or an object, not background texture
    covered = bool(hits) or busy > max(0.03, 1.5 * overall)
    if hits:
        detail = f"{' and '.join(hits)} sits where YouTube shows the video length."
    elif covered:
        detail = "Something detailed sits where YouTube shows the video length. Keep that corner plain."
    else:
        detail = "Bottom-right corner is clear for the video length."
    return {"id": "corner", "label": "Timestamp corner clear", "ok": not covered, "detail": detail,
            "value": round(busy, 3)}


def _overlaps(box: dict, corner: tuple) -> bool:
    try:
        x, y, w, h = (float(box[k]) for k in ("x", "y", "w", "h"))
    except (KeyError, TypeError, ValueError):
        return False
    ox = min(x + w, 1.0) - max(x, corner[0])
    oy = min(y + h, 1.0) - max(y, corner[1])
    return ox > 0.01 and oy > 0.01


def check_clutter(im: Image.Image) -> dict:
    small = im.resize(PHONE, Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float64)
    gray = luminance(arr)
    edges = edge_density(gray, 0.10)
    q = (arr // 64).astype(int)
    bins = q[..., 0] * 16 + q[..., 1] * 4 + q[..., 2]
    counts = np.bincount(bins.ravel(), minlength=64) / bins.size
    colors = int((counts > 0.015).sum())
    cluttered = edges > 0.30 or colors > 14 or (edges > 0.22 and colors > 10)
    detail = (f"Busy at phone size ({round(edges * 100)}% edges, {colors} distinct colors). Cut it down to "
              "one subject and a few words." if cluttered else
              f"Reads cleanly at phone size ({round(edges * 100)}% edges, {colors} distinct colors).")
    return {"id": "clutter", "label": "Clean at phone size", "ok": not cluttered, "detail": detail,
            "value": {"edges": round(edges, 3), "colors": colors}}


def check_colorblind(im: Image.Image, facts: dict | None) -> dict:
    small = np.asarray(im.resize((96, 54), Image.LANCZOS), dtype=np.float64)
    sim = np.asarray(simulate(Image.fromarray(small.astype(np.uint8)), "deutan"), dtype=np.float64)
    a, b = lab(small).reshape(-1, 3), lab(sim).reshape(-1, 3)
    centers, labels = kmeans(a.copy(), 5)
    share = np.bincount(labels, minlength=len(centers)) / len(labels)
    sim_centers = np.array([b[labels == j].mean(0) if (labels == j).any() else centers[j]
                            for j in range(len(centers))])
    worst = None
    for i in range(len(centers)):
        for j in range(i + 1, len(centers)):
            if share[i] < 0.04 or share[j] < 0.04:
                continue
            before = float(np.linalg.norm(centers[i] - centers[j]))
            after = float(np.linalg.norm(sim_centers[i] - sim_centers[j]))
            if before > 25 and after < 12 and (worst is None or before - after > worst[0]):
                worst = (before - after, before, after)
    text_fail = False
    for t in (facts or {}).get("texts", []):  # text that only stands out by red vs green
        c0, c1 = _box_contrast(small, t), _box_contrast(sim, t)
        if c0 and c1 and c0 >= 2.5 and c1 < 1.6:
            text_fail = True
    fails = bool(worst) or text_fail
    if text_fail:
        detail = "The words lose their contrast for red-green colorblind viewers. Add a dark outline or change one color."
    elif worst:
        detail = (f"Two main colors look almost the same to red-green colorblind viewers "
                  f"(difference drops from {worst[1]:.0f} to {worst[2]:.0f}). Make them differ in brightness too.")
    else:
        detail = "Still reads in the red-green colorblind preview."
    return {"id": "colorblind", "label": "Works for red-green colorblind", "ok": not fails, "detail": detail}


def _box_contrast(arr: np.ndarray, box: dict) -> float | None:
    try:
        h, w = arr.shape[:2]
        x0, y0 = int(float(box["x"]) * w), int(float(box["y"]) * h)
        x1, y1 = int((float(box["x"]) + float(box["w"])) * w) + 1, int((float(box["y"]) + float(box["h"])) * h) + 1
    except (KeyError, TypeError, ValueError):
        return None
    patch = arr[max(0, y0):min(h, y1), max(0, x0):min(w, x1)]
    if patch.size < 12:
        return None
    lum = luminance(patch).ravel()
    lo, hi = np.percentile(lum, 10), np.percentile(lum, 90)
    return (hi + 0.05) / (lo + 0.05)


def check_words(facts: dict | None) -> list[dict]:
    if facts is None:
        msg = "Needs Claude to read the text (add your API key in Settings)."
        return [{"id": "words", "label": "5 words or fewer", "ok": None, "detail": msg},
                {"id": "readable", "label": "Readable when small", "ok": None, "detail": msg}]
    texts = [t for t in facts.get("texts", []) if str(t.get("text", "")).strip()]
    words = sum(len(str(t["text"]).split()) for t in texts)
    out = [{"id": "words", "label": "5 words or fewer", "ok": words <= 5,
            "detail": (f'{words} words: "{" / ".join(t["text"] for t in texts)}". Cut to 5 or fewer.' if words > 5 else
                       f'{words} word{"s" if words != 1 else ""}' + (f': "{" / ".join(t["text"] for t in texts)}"' if texts else " (no text)") + ".")}]
    small_px = []
    for t in texts:
        try:
            small_px.append(float(t["h"]) * PHONE[1] / max(1, len(str(t["text"]).splitlines())))
        except (KeyError, TypeError, ValueError):
            continue
    unreadable = [px for px in small_px if px < 9]
    if not texts:
        out.append({"id": "readable", "label": "Readable when small", "ok": True, "detail": "No text to read."})
    else:
        ok = not unreadable and not facts.get("text_hard_to_read")
        detail = ("Text is big enough to read at phone size." if ok else
                  f"Some text is about {min(small_px or [0]):.0f}px tall at phone size (needs 9+). Make it bigger or bolder."
                  if unreadable else facts.get("text_hard_to_read") or "Text is hard to read when small.")
        out.append({"id": "readable", "label": "Readable when small", "ok": ok, "detail": detail})
    return out


def check_face(facts: dict | None) -> dict:
    if facts is None:
        return {"id": "face", "label": "Face centered", "ok": None,
                "detail": "Needs Claude to find the face (add your API key in Settings)."}
    faces = facts.get("faces", [])
    if not faces:
        return {"id": "face", "label": "Face centered", "ok": None, "detail": "No face in this one."}
    f = max(faces, key=lambda b: float(b.get("w", 0)) * float(b.get("h", 0)))
    cx = float(f["x"]) + float(f["w"]) / 2
    off = cx - 0.5
    ok = abs(off) <= 0.17
    side = "left" if off < 0 else "right"
    return {"id": "face", "label": "Face centered", "ok": ok,
            "detail": "Face is centered." if ok else f"Face sits to the {side} ({abs(off) * 100:.0f}% off center). Center it."}


def score(path: Path, facts: dict | None) -> dict:
    """Run every check on one thumbnail. facts = Claude's reading, or None without Claude."""
    im = load(path)
    checks = [check_corner(im, facts), check_clutter(im), *check_words(facts), check_colorblind(im, facts),
              check_face(facts)]
    base = int(facts.get("appeal", 70)) if facts else 70
    total = base - sum(PENALTY[c["id"]] for c in checks if c["ok"] is False)
    return {
        "score": max(0, min(100, total)),
        "base": base,
        "base_from": "claude" if facts else "default (no Claude)",
        "why": (facts or {}).get("appeal_why", ""),
        "checks": checks,
    }


def rank(items: list[dict]) -> list[dict]:
    """items need 'score'; ties keep upload order. Adds 'rank' (1 = best)."""
    order = sorted(range(len(items)), key=lambda i: (-(items[i].get("score") or -1), i))
    for r, i in enumerate(order, start=1):
        items[i]["rank"] = r
    return items


def write_previews(path: Path, out_dir: Path, stem: str) -> dict:
    """Colorblind (deutan) preview and a phone-size preview, next to the stored thumbnail."""
    im = load(path)
    out_dir.mkdir(parents=True, exist_ok=True)
    simulate(im, "deutan").save(out_dir / f"{stem}.cb.png")
    im.resize(PHONE, Image.LANCZOS).save(out_dir / f"{stem}.phone.png")
    return {"cb": f"{stem}.cb.png", "phone": f"{stem}.phone.png"}
