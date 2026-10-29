"""One project folder (one video): its files, analysis state and the analysis queue.

Everything the app remembers about a project lives in <project>/.blkgrlco-bin/
so it travels with the T7. Originals are never modified by analysis.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import frames, lut, media, naming, proxy, settings as settings_mod, speech, vision

log = logging.getLogger("blkbin.project")

STATE_DIR = ".blkgrlco-bin"
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analyze")
_projects: dict[str, "Project"] = {}
_projects_lock = threading.Lock()


class ProjectError(Exception):
    pass


def open_project(path: str) -> "Project":
    root = Path(path).expanduser().resolve()
    check_folder(root)
    with _projects_lock:
        key = str(root)
        if key not in _projects:
            _projects[key] = Project(root)
        proj = _projects[key]
    proj.refresh()
    settings_mod.remember_project(key)
    return proj


def check_folder(root: Path) -> None:
    if not root.is_dir():
        raise ProjectError(f"{root} isn't a folder.")
    if root == root.parent or str(root) in ("/Volumes", str(Path.home())) or root.parent == Path("/Volumes"):
        raise ProjectError("That's a whole drive or your home folder. Pick one video's folder instead.")
    if root.name.lower() == "project hhh":
        raise ProjectError('That\'s the whole "project hhh" folder. Pick one video\'s subfolder inside it.')


class Project:
    def __init__(self, root: Path):
        self.root = root
        self.state_dir = root / STATE_DIR
        self.lock = threading.RLock()
        self.state = {"version": 1, "files": {}, "cache": {}}
        self.last_plan = None
        self._load()

    # ---- persistence -----------------------------------------------------
    def _state_path(self) -> Path:
        return self.state_dir / "state.json"

    def _load(self) -> None:
        p = self._state_path()
        if p.exists():
            try:
                self.state = json.loads(p.read_text())
            except ValueError:
                broken = p.with_name(f"state.broken-{int(time.time())}.json")
                p.replace(broken)  # keep it for inspection, start fresh
        # anything mid-analysis when the app last quit goes back to waiting
        for e in self.state["files"].values():
            if e.get("state") in ("queued", "analyzing"):
                e["state"] = "waiting"

    def save(self) -> None:
        with self.lock:
            self.state_dir.mkdir(exist_ok=True)
            tmp = self._state_path().with_suffix(".tmp")
            tmp.write_text(json.dumps(self.state, indent=1))
            tmp.replace(self._state_path())

    @property
    def name(self) -> str:
        return self.root.name

    def rel(self, p: Path) -> str:
        return p.relative_to(self.root).as_posix()

    # ---- scanning --------------------------------------------------------
    def refresh(self) -> None:
        """Rescan the folder. Files are matched by content, so renames keep their analysis."""
        with self.lock:
            files = self.state["files"]
            cache = self.state.setdefault("cache", {})
            new_cache = {}
            seen = set()
            for p in media.scan(self.root):
                rel = self.rel(p)
                st = p.stat()
                key = [st.st_size, st.st_mtime_ns]
                cached = cache.get(rel)
                if cached and cached[:2] == key:
                    fid = cached[2]
                else:
                    fid = media.fingerprint(p)
                n = 2
                base = fid.split("~")[0]
                while fid in seen:  # byte-identical duplicates
                    fid, n = f"{base}~{n}", n + 1
                seen.add(fid)
                new_cache[rel] = key + [fid]
                entry = files.get(fid)
                if entry is None:
                    files[fid] = {
                        "fid": fid, "path": rel, "original_name": p.name, "original_path": rel,
                        "kind": media.kind_of(p), "size": st.st_size, "state": "waiting",
                        "include": True, "category": None, "category_source": None,
                        "title_override": None, "applied": None,
                    }
                else:
                    entry["path"] = rel
                    entry["size"] = st.st_size
                    entry.pop("missing", None)
            for fid, entry in files.items():
                if fid not in seen:
                    entry["missing"] = True
            self.state["cache"] = new_cache
            self.save()

    def entries(self) -> list[dict]:
        with self.lock:
            return [e for e in self.state["files"].values() if not e.get("missing")]

    def get(self, fid: str) -> dict:
        e = self.state["files"].get(fid)
        if not e or e.get("missing"):
            raise ProjectError("That file isn't in this project anymore.")
        return e

    # ---- analysis --------------------------------------------------------
    def queue(self, fids: list[str] | None = None, force: bool = False) -> int:
        with self.lock:
            targets = []
            for e in self.entries():
                if fids is not None and e["fid"] not in fids:
                    continue
                if e["state"] in ("queued", "analyzing"):
                    continue
                if not force and e["state"] == "done":
                    continue
                e["state"] = "queued"
                if force and e.get("category_source") != "user":
                    e["category"] = None
                targets.append(e["fid"])
            self.save()
        for fid in targets:
            _executor.submit(self._analyze_safe, fid)
        return len(targets)

    def _analyze_safe(self, fid: str) -> None:
        try:
            self.analyze(fid)
        except Exception as exc:
            log.exception("analysis failed for %s", fid)
            with self.lock:
                e = self.state["files"].get(fid)
                if e:
                    e["state"] = "error"
                    e["error"] = str(exc)[:300]
                    self.save()

    def analyze(self, fid: str) -> None:
        cfg = settings_mod.load()
        with self.lock:
            e = self.state["files"][fid]
            if e.get("missing"):
                return
            e["state"] = "analyzing"
            e.pop("error", None)
            src = self.root / e["path"]
            self.save()

        try:
            info = media.probe(src) if e["kind"] != "photo" else _photo_probe(src)
        except RuntimeError as exc:
            with self.lock:
                e["broken"] = str(exc)[:200]
            raise ProjectError("Can't read this file. Use “Fix + proxies” to make a _fixed copy.") from None
        facts = {
            "kind": e["kind"],
            "duration": info.get("duration") if e["kind"] != "photo" else None,
            "orientation": media.orientation(info),
            "device": media.device(src, info),
            "date": media.shot_date(src, info),
        }
        broken = proxy.decode_check(src, facts["duration"]) if e["kind"] == "video" else None
        # LUT FIRST: D-Log M frames are converted to Rec.709 before Claude (or you) sees them
        use_lut = lut.wanted(e, facts["device"])
        pre = lut.filter_for() if use_lut else None
        facts["lut"] = "applied" if pre else "missing" if use_lut else None
        frame_names = frames.extract(src, e["kind"], facts["duration"], self.state_dir / "frames", fid, pre)
        if e["kind"] == "photo":
            sp = {"level": "none", "ratio": 0.0, "transcript": "", "engine": "photo"}
        else:
            sp = speech.analyze(src, facts["duration"], info.get("has_audio", False), cfg)
        with self.lock:
            e.update(facts)
            e["probe"] = {k: info.get(k) for k in ("width", "height", "fps", "video_codec", "audio_codec",
                                                   "has_audio", "color_transfer")}
            e["frames"] = frame_names
            e["speech"] = sp
            e["lut"] = facts["lut"]
            if broken:
                e["broken"] = broken
            else:
                e.pop("broken", None)
            self.save()

        result = vision.classify({
            **facts,
            "original_name": e["original_name"],
            "duration_text": media.human_duration(facts["duration"]),
            "speech_level": sp["level"], "speech_ratio": sp["ratio"],
            "speech_engine": sp.get("engine"), "transcript": sp.get("transcript", ""),
        }, [self.state_dir / "frames" / n for n in frame_names], cfg)

        with self.lock:
            e["analysis"] = result
            if e.get("category_source") != "user" or not e.get("category"):
                e["category"] = result["category"]
                e["category_source"] = result.get("source", "rules")
            e["state"] = "done"
            e["analyzed_at"] = time.time()
            self.save()

    # ---- edits from the UI -----------------------------------------------
    def update(self, fid: str, changes: dict) -> dict:
        cfg = settings_mod.load()
        with self.lock:
            e = self.get(fid)
            if "category" in changes:
                if not settings_mod.category(cfg, changes["category"]):
                    raise ProjectError("Unknown category")
                e["category"] = changes["category"]
                e["category_source"] = "user"
            if "include" in changes:
                e["include"] = bool(changes["include"])
            if "title" in changes:
                t = naming.slugify(str(changes["title"] or ""))
                e["title_override"] = t or None
            if "lut" in changes:  # the card's LUT switch; the caller re-analyzes
                e["lut_override"] = None if changes["lut"] is None else bool(changes["lut"])
            self.save()
            return e

    # ---- names and status ------------------------------------------------
    def proposals(self, cfg: dict) -> dict[str, str]:
        """fid -> proposed base file name (before any -2 suffix)."""
        out = {}
        ready = [e for e in self.entries() if e.get("category") and e["state"] == "done"]
        groups: dict[tuple, list] = {}
        for e in ready:
            groups.setdefault((e.get("date"), e["category"]), []).append(e)
        for group in groups.values():
            group.sort(key=lambda x: x["original_name"].lower())
            for i, e in enumerate(group, start=1):
                name = naming.propose(e, cfg, self.name, seq=i)
                if name:
                    out[e["fid"]] = name
        return out

    def target_dir(self, e: dict, cfg: dict) -> str:
        cat = settings_mod.category(cfg, e["category"])
        return naming.folder_name(cat["name"] if cat else "Uncategorized")

    def status(self, e: dict, cfg: dict, proposals: dict) -> str:
        if e["state"] in ("queued", "waiting"):
            return "waiting"
        if e["state"] == "analyzing":
            return "analyzing"
        if e["state"] == "error":
            return "error"
        proposed = proposals.get(e["fid"])
        want_dir = self.target_dir(e, cfg)
        applied = e.get("applied")
        if applied and applied["path"] == e["path"] and applied["name"] == proposed \
                and applied["category"] == e["category"]:
            return "saved"
        if proposed and e["path"] == f"{want_dir}/{proposed}":
            return "saved"
        return "included" if e.get("include", True) else "skipped"

    def view(self) -> dict:
        cfg = settings_mod.load()
        props = self.proposals(cfg)
        from . import registry
        channel = registry.channel_for_folder(self.root)
        look = lut.look_path(channel)
        cards = []
        for e in sorted(self.entries(), key=lambda x: x["path"].lower()):
            cat = settings_mod.category(cfg, e.get("category"))
            sp = e.get("speech") or {}
            an = e.get("analysis") or {}
            proposed = props.get(e["fid"])
            cards.append({
                "fid": e["fid"],
                "path": e["path"],
                "name": Path(e["path"]).name,
                "original_name": e["original_name"],
                "kind": e["kind"],
                "size": media.human_size(e["size"]),
                "duration": media.human_duration(e.get("duration")) if e["kind"] != "photo" else None,
                "seconds": e.get("duration"),
                "device": e.get("device"),
                "orientation": e.get("orientation"),
                "date": e.get("date"),
                "speech": sp.get("level"),
                "speech_ratio": sp.get("ratio"),
                "speech_engine": sp.get("engine"),
                "description": an.get("description"),
                "source": e.get("category_source"),
                "note": an.get("note"),
                "frames": e.get("frames", []),
                "category": e.get("category"),
                "category_name": cat["name"] if cat else None,
                "color": cat["color"] if cat else None,
                "proposed_name": proposed,
                "proposed_path": f"{self.target_dir(e, cfg)}/{proposed}" if proposed else None,
                "title": naming.title_slug(e, naming.slugify(cat["name"]) if cat else "") if proposed else None,
                "include": e.get("include", True),
                "status": self.status(e, cfg, props),
                "queued": e["state"] == "queued",
                "error": e.get("error"),
                "lut": e.get("lut"),
                # step 2: the channel's creative look on the card thumbnails (never on what Claude sees)
                "look": bool(look) and e["kind"] == "video" and e.get("lut") != "missing" and bool(e.get("frames"))
                and e.get("device") != "Screen recording",
                "broken": e.get("broken"),
                "fixed_path": e.get("fixed_path"),
                "proxy": (e.get("proxy") or {}).get("path") if (e.get("proxy") or {}).get("for_path") == e["path"] else None,
                "flubs": _flub_summary(e.get("flubmap")),
            })
        journal = latest_journal(self)
        todo = proxy.todo(self)
        return {
            "fix_count": len(todo["fix"]),
            "proxy_count": len(todo["proxy"]),
            "lut": lut.status(),
            "channel": channel,
            "look": {"on": bool(look), "name": look.stem if look else None},
            "path": str(self.root),
            "name": self.name,
            "cards": cards,
            "undo_available": bool(journal),
            "undo_count": len(journal["ops"]) if journal else 0,
            "claude": vision.available(),
            "whisper": speech.whisper_available(),
        }


def _flub_summary(m: dict | None) -> dict | None:
    if not m:
        return None
    return {"markers": sum(1 for f in m.get("flubs", []) if f["kind"] == "marker"),
            "possible": sum(1 for f in m.get("flubs", []) if f["kind"] == "possible"),
            "silences": len(m.get("silences", [])), "takes": len(m.get("takes", []))}


def _photo_probe(src: Path) -> dict:
    try:
        info = media.probe(src)
    except RuntimeError:
        info = {"tags": {}}
    if not info.get("width"):
        try:
            from PIL import Image
            with Image.open(src) as im:
                info["width"], info["height"] = im.size
        except Exception:
            pass
    info["duration"] = None
    info["has_audio"] = False
    return info


def latest_journal(project: Project) -> dict | None:
    from .submit import latest_undoable
    return latest_undoable(project)
