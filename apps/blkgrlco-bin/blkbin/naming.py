"""Proposed file names, e.g. 2026-10-11_talking-head-desk-intro.mp4"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from .settings import NAME_FORMATS, category


def slugify(text: str, max_len: int = 48) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    if len(text) > max_len:
        text = text[:max_len].rsplit("-", 1)[0] or text[:max_len]
    return text


def folder_name(name: str) -> str:
    """Category folder name as typed in Settings, minus characters Finder rejects."""
    return re.sub(r"[/:\\]", "-", name).strip() or "Uncategorized"


def title_slug(entry: dict, cat_slug: str) -> str:
    raw = entry.get("title_override") or (entry.get("analysis") or {}).get("title") or ""
    slug = slugify(raw)
    if cat_slug and slug.startswith(cat_slug + "-"):  # avoid "talking-head-talking-head-..."
        slug = slug[len(cat_slug) + 1:]
    if not slug:
        slug = slugify(Path(entry["original_name"]).stem)
    return slug


def propose(entry: dict, settings: dict, project_name: str, seq: int = 1) -> str | None:
    """Base file name (no folder) for an analyzed entry, or None if not ready."""
    if not entry.get("category"):
        return None
    cat = category(settings, entry["category"])
    cat_slug = slugify(cat["name"]) if cat else "uncategorized"
    ext = Path(entry["path"]).suffix.lower()
    fmt = settings.get("name_format", "date_category_title")
    if fmt == "keep":
        return Path(entry["path"]).name
    stem = NAME_FORMATS[fmt].format(
        date=entry.get("date") or "undated",
        category=cat_slug,
        title=title_slug(entry, cat_slug),
        project=slugify(project_name, 32) or "project",
        seq=f"{seq:03d}",
        original=Path(entry["original_name"]).stem,
    )
    return stem + ext
