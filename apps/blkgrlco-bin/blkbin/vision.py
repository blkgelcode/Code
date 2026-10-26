"""Claude vision: a short description, a short title and a category for each clip.

Without an API key or the anthropic package, falls back to simple rules
(speech level + device + file type) so the app still works offline.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("blkbin.vision")

SYSTEM = """You sort raw footage for a YouTube creator (BLKGRLCO Studios).
She films vertical vlogs on a DJI Osmo Pocket 3 in D-Log M, so DJI frames look flat,
grey and low-contrast. That is normal and says nothing about the content.
She also films on an iPhone, and some clips are horizontal.
You get up to 3 frames from a clip (at 15%, 50% and 85% of its length), plus facts
measured locally: file type, device, duration, orientation, how much talking the
local speech detector heard, and the start of a transcript when there is one.
Pick exactly one category from the list. Write a plain, specific description of what
is on screen (max 20 words) and a 2-5 word title that would make a good file name
(lowercase words, no dates, no category name)."""


def available() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
        return True
    except ImportError:
        return False


def classify(facts: dict, frame_paths: list[Path], settings: dict) -> dict:
    if available():
        try:
            return _claude(facts, frame_paths, settings)
        except Exception as exc:  # network, quota, refusal: keep going with rules
            log.warning("Claude call failed, using rules: %s", exc)
            result = rules(facts, settings)
            result["note"] = f"Claude unavailable ({type(exc).__name__}: {str(exc)[:120]}); used rules"
            return result
    return rules(facts, settings)


def rules(facts: dict, settings: dict) -> dict:
    ids = {c["id"] for c in settings["categories"]}

    def pick(*options):
        for o in options:
            if o in ids:
                return o
        return settings["categories"][0]["id"]

    kind = facts.get("kind")
    speech = facts.get("speech_level", "none")
    ratio = facts.get("speech_ratio") or 0
    if kind == "photo":
        cat = pick("photos")
    elif kind == "audio":
        long_or_song = (facts.get("duration") or 0) >= 30 or facts.get("device") == "Epidemic Sound"
        cat = pick("music") if long_or_song else pick("sound-effects")
    elif facts.get("device") == "Screen recording":
        cat = pick("screen-recording")
    elif speech == "lots" or (speech == "some" and ratio >= 0.25):
        cat = pick("talking-head")
    else:
        cat = pick("b-roll")
    return {"category": cat, "title": "", "description": "", "confidence": "low", "source": "rules"}


def _schema(settings: dict) -> dict:
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": [c["id"] for c in settings["categories"]]},
            "title": {"type": "string"},
            "description": {"type": "string"},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        },
        "required": ["category", "title", "description", "confidence"],
        "additionalProperties": False,
    }


def _prompt(facts: dict, settings: dict) -> str:
    cats = "\n".join(f"- {c['id']}: {c['name']}. {c.get('hint', '')}" for c in settings["categories"])
    lines = [
        "Categories:", cats, "", "Clip facts:",
        f"- original file name: {facts.get('original_name')}",
        f"- type: {facts.get('kind')}",
        f"- device: {facts.get('device')}",
        f"- duration: {facts.get('duration_text')}",
        f"- orientation: {facts.get('orientation') or 'n/a'}",
        f"- talking heard: {facts.get('speech_level')} ({round((facts.get('speech_ratio') or 0) * 100)}% of the clip,"
        f" detector: {facts.get('speech_engine')})",
    ]
    if facts.get("transcript"):
        lines.append(f"- transcript start: \"{facts['transcript'][:600]}\"")
    if facts.get("kind") == "audio":
        lines.append("There are no frames for audio files; the image, if any, is a waveform.")
    return "\n".join(lines)


def _claude(facts: dict, frame_paths: list[Path], settings: dict) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    content = []
    for p in frame_paths[:3]:
        media_type = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type,
                       "data": base64.standard_b64encode(p.read_bytes()).decode()},
        })
    content.append({"type": "text", "text": _prompt(facts, settings)})
    request = dict(
        model=settings.get("claude_model", "claude-opus-5-5"),
        max_tokens=8000,
        system=SYSTEM,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": _schema(settings)}},
    )
    # Server-side refusal fallback: if the model declines, the API retries on
    # Anthropic's recommended fallback model inside the same call.
    response = client.beta.messages.create(
        betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request,
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to describe this clip")
    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)
    data["source"] = "claude"
    data["model"] = response.model
    return data


# ---- thumbnails ------------------------------------------------------------------

THUMB_SYSTEM = """You review YouTube thumbnails for a creator (BLKGRLCO Studios: personal
development, travel, and a podcast). Read the image exactly as it is.
Coordinates are fractions of the image size: x and y are the top-left corner,
w and h are the width and height, all between 0 and 1.
- texts: every separate block of words printed on the thumbnail, copied exactly.
  h is the height of one line of that text.
- faces: every human face, largest first.
- text_hard_to_read: empty if all text reads easily on a phone; otherwise one short
  sentence saying what makes it hard (thin font, low contrast, busy background behind it).
- appeal: 0-100, how likely a viewer scrolling on a phone is to click, judged only on
  clarity, emotion, contrast and curiosity. Most thumbnails land between 40 and 85.
- appeal_why: one short sentence."""

_BOX = {"type": "object", "properties": {k: {"type": "number"} for k in ("x", "y", "w", "h")},
        "required": ["x", "y", "w", "h"], "additionalProperties": False}
THUMB_SCHEMA = {
    "type": "object",
    "properties": {
        "texts": {"type": "array", "items": {
            "type": "object",
            "properties": {"text": {"type": "string"}, **_BOX["properties"]},
            "required": ["text", "x", "y", "w", "h"], "additionalProperties": False}},
        "faces": {"type": "array", "items": _BOX},
        "text_hard_to_read": {"type": "string"},
        "appeal": {"type": "integer"},
        "appeal_why": {"type": "string"},
    },
    "required": ["texts", "faces", "text_hard_to_read", "appeal", "appeal_why"],
    "additionalProperties": False,
}


def thumbnail_facts(path: Path, settings: dict) -> dict | None:
    """Claude's reading of one thumbnail, or None when Claude isn't available."""
    if not available():
        return None
    import anthropic

    client = anthropic.Anthropic()
    media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    response = client.beta.messages.create(
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        model=settings.get("claude_model", "claude-opus-5-5"),
        max_tokens=8000,
        system=THUMB_SYSTEM,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                         "data": base64.standard_b64encode(path.read_bytes()).decode()}},
            {"type": "text", "text": "Read this thumbnail."},
        ]}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": THUMB_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to read this thumbnail")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    data["appeal"] = max(0, min(100, int(data.get("appeal", 70))))
    return data


# ---- ideas from a screenshot ----------------------------------------------------------

IDEAS_SCHEMA = {
    "type": "object",
    "properties": {"ideas": {"type": "array", "items": {"type": "string"}}},
    "required": ["ideas"], "additionalProperties": False,
}


def extract_ideas(data: bytes, media_type: str, settings: dict) -> list[str]:
    """Read a screenshot of a list (Notes, a whiteboard, a chat) and return one idea per item."""
    if not available():
        raise RuntimeError("Reading screenshots needs Claude. Add your API key in Settings → Connections.")
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        model=settings.get("claude_model", "claude-opus-5-5"),
        max_tokens=8000,
        system="You copy video ideas out of screenshots of lists. Return each list item exactly as written, "
               "one string per item, in order. Leave out headings, dates, checkboxes and app interface text. "
               "If an item wraps onto two lines, join it into one.",
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                         "data": base64.standard_b64encode(data).decode()}},
            {"type": "text", "text": "Copy the ideas from this list."},
        ]}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": IDEAS_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to read this screenshot.")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    return [s.strip() for s in data.get("ideas", []) if s and s.strip()]
