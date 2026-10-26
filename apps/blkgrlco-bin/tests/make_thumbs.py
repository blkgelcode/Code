"""Synthetic thumbnails for tests: python tests/make_thumbs.py OUT_DIR

Each comes with the 'facts' Claude would return, so the checks can be tested
without an API key.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720


def font(size):
    for name in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def face(d, cx, cy, r):
    d.ellipse([cx - r, cy - r * 1.2, cx + r, cy + r * 1.2], fill=(141, 85, 60))
    d.ellipse([cx - r * .45, cy - r * .3, cx - r * .25, cy - r * .1], fill=(30, 15, 5))
    d.ellipse([cx + r * .25, cy - r * .3, cx + r * .45, cy - r * .1], fill=(30, 15, 5))
    d.arc([cx - r * .4, cy + r * .1, cx + r * .4, cy + r * .6], 20, 160, fill=(80, 10, 30), width=8)


def make(out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    facts = {}

    im = Image.new("RGB", (W, H), (240, 218, 194)); d = ImageDraw.Draw(im)
    face(d, 640, 380, 170)
    d.text((60, 40), "3 DAYS", font=font(150), fill=(73, 0, 27))
    im.save(out / "clean.png")
    facts["clean.png"] = {"texts": [{"text": "3 DAYS", "x": .05, "y": .06, "w": .45, "h": .2}],
                          "faces": [{"x": .37, "y": .25, "w": .26, "h": .56}], "text_hard_to_read": "",
                          "appeal": 78, "appeal_why": "One face, one big number."}

    rnd = random.Random(1)
    im = Image.new("RGB", (W, H), (255, 255, 255)); d = ImageDraw.Draw(im)
    for _ in range(260):
        x, y = rnd.randrange(W), rnd.randrange(H)
        c = tuple(rnd.randrange(256) for _ in range(3))
        d.rectangle([x, y, x + rnd.randrange(20, 160), y + rnd.randrange(20, 120)], fill=c, outline=(0, 0, 0), width=3)
    face(d, 250, 360, 90)
    d.text((520, 600), "my whole morning routine for real this time", font=font(34), fill=(0, 0, 0))
    im.save(out / "cluttered.png")
    facts["cluttered.png"] = {"texts": [{"text": "my whole morning routine for real this time",
                                         "x": .40, "y": .83, "w": .58, "h": .05}],
                              "faces": [{"x": .13, "y": .35, "w": .14, "h": .3}], "text_hard_to_read": "",
                              "appeal": 62, "appeal_why": "Lots going on."}

    im = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W // 2, H], fill=(205, 92, 70))
    d.rectangle([W // 2, 0, W, H], fill=(120, 140, 40))
    face(d, 640, 400, 150)
    d.text((80, 60), "RED", font=font(140), fill=(110, 145, 30))
    im.save(out / "redgreen.png")
    facts["redgreen.png"] = {"texts": [{"text": "RED", "x": .06, "y": .08, "w": .25, "h": .2}],
                             "faces": [{"x": .38, "y": .3, "w": .24, "h": .5}], "text_hard_to_read": "",
                             "appeal": 70, "appeal_why": "Bold colors."}

    im = Image.new("RGB", (W, H), (240, 218, 194)); d = ImageDraw.Draw(im)
    face(d, 300, 380, 170)
    d.text((1000, 640), "NEW", font=font(70), fill=(73, 0, 27))
    im.save(out / "corner.png")
    facts["corner.png"] = {"texts": [{"text": "NEW", "x": .78, "y": .88, "w": .14, "h": .09}],
                           "faces": [{"x": .1, "y": .25, "w": .26, "h": .56}], "text_hard_to_read": "",
                           "appeal": 66, "appeal_why": "Face on the left."}
    (out / "facts.json").write_text(json.dumps(facts, indent=1))
    return facts


if __name__ == "__main__":
    make(Path(sys.argv[1] if len(sys.argv) > 1 else "thumb-fixtures"))
