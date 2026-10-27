"""FLUB + SILENCE MAP for clips with talking.

  silence   ffmpeg silencedetect: anything quieter than settings.silence_db for silence_min seconds
  markers   her "lululu" / "la la la" flub marker, from Whisper's word timestamps
  possible  a gap between transcribed words where there IS sound: Whisper often drops nonsense
            syllables, so a voiced gap is a likely marker it skipped
  takes     the same line said more than once, ranked by delivery

Everything is written into _footage-master.md (older versions kept in .blkgrlco-bin/history).
Check one clip against what she actually said before trusting it: `python -m blkbin.cli flubmap`.
"""
from __future__ import annotations

import difflib
import re
import subprocess
import threading
from pathlib import Path

from . import speech

MARKER_TOKEN = re.compile(r"^(?:l[aeuo]){1,}$")   # la, lu, lala, lululu, lalala
MARKER_HINT = "Um, uh, lululu, la la la. Okay, so,"
FILLERS = {"um", "uh", "erm", "hmm", "like", "basically", "literally"}
GAP_MIN = 0.6          # seconds between words before a gap counts
TAKE_SIMILARITY = 0.6
_lock = threading.Lock()


# ---- measuring ------------------------------------------------------------------

def silences(path: Path, noise_db: float = -35, min_len: float = 0.7) -> list[list[float]]:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-vn",
                          "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"],
                         capture_output=True, text=True, timeout=3600)
    spans, start = [], None
    for line in out.stderr.splitlines():
        m = re.search(r"silence_start: (-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and start is not None:
            spans.append([round(start, 2), round(float(m.group(1)), 2)])
            start = None
    if start is not None:  # silent to the end of the clip
        end = _duration(path)
        if end and end - start >= min_len:
            spans.append([round(start, 2), round(end, 2)])
    return spans


def _duration(path: Path) -> float | None:
    try:
        from .media import probe
        return probe(path).get("duration")
    except Exception:
        return None


def transcribe(path: Path, settings: dict) -> list[dict]:
    """Whisper segments with word timestamps. Tests replace this."""
    if not speech.whisper_available():
        raise RuntimeError("The flub map needs local Whisper. Run the start script again to install it.")
    with speech._lock:
        model = speech._get_model(settings.get("whisper_model", "small"))
        segs, _info = model.transcribe(str(path), word_timestamps=True, vad_filter=False, beam_size=5,
                                       condition_on_previous_text=False, initial_prompt=MARKER_HINT)
        out = []
        for s in segs:
            out.append({"start": s.start, "end": s.end, "text": s.text.strip(),
                        "words": [{"start": w.start, "end": w.end, "word": w.word, "prob": w.probability}
                                  for w in (s.words or [])]})
    return out


# ---- finding things -----------------------------------------------------------------

def _norm(word: str) -> str:
    return re.sub(r"[^a-z']", "", word.lower().replace("-", ""))


def _is_marker(tok: str) -> bool:
    return bool(MARKER_TOKEN.match(tok)) and tok not in {"lo", "le"}


def find_markers(words: list[dict]) -> list[dict]:
    """Runs of la/lu syllables. A lone "la" or "lu" only counts next to another one."""
    out, i = [], 0
    while i < len(words):
        tok = _norm(words[i]["word"])
        if _is_marker(tok):
            j = i
            while j + 1 < len(words) and _is_marker(_norm(words[j + 1]["word"])):
                j += 1
            run = [_norm(w["word"]) for w in words[i:j + 1]]
            if j > i or len(run[0]) >= 4:  # "la la" or "lululu", not a single "la"
                out.append({"t": round(words[i]["start"], 2), "end": round(words[j]["end"], 2),
                            "kind": "marker", "text": " ".join(w["word"].strip() for w in words[i:j + 1])})
            i = j + 1
        else:
            i += 1
    return out


def _silent_share(a: float, b: float, quiet: list[list[float]]) -> float:
    covered = sum(max(0.0, min(b, e) - max(a, s)) for s, e in quiet)
    return covered / (b - a) if b > a else 1.0


def find_voiced_gaps(words: list[dict], quiet: list[list[float]], markers: list[dict]) -> list[dict]:
    out = []
    for prev, nxt in zip(words, words[1:]):
        a, b = prev["end"], nxt["start"]
        if b - a < GAP_MIN or _silent_share(a, b, quiet) > 0.5:
            continue
        if any(m["t"] < b and m["end"] > a for m in markers):
            continue
        out.append({"t": round(a, 2), "end": round(b, 2), "kind": "possible",
                    "text": f"{b - a:.1f}s of sound with no words (a lululu Whisper skipped?)"})
    return out


def _take_words(seg: dict) -> list[str]:
    return [t for t in (_norm(w["word"]) for w in seg.get("words") or []) if t and not _is_marker(t)] or \
        [t for t in (_norm(w) for w in seg["text"].split()) if t and not _is_marker(t)]


def find_takes(segments: list[dict], quiet: list[list[float]], markers: list[dict]) -> list[dict]:
    """Group segments that say the same line, then rank each group's takes."""
    segs = [s for s in segments if len(_take_words(s)) >= 3]
    parent = list(range(len(segs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(segs)):
        wi = _take_words(segs[i])
        for j in range(i + 1, len(segs)):
            wj = _take_words(segs[j])
            sim = difflib.SequenceMatcher(None, wi, wj, autojunk=False).ratio()
            short, long_ = (wi, wj) if len(wi) <= len(wj) else (wj, wi)
            n = sum(1 for a, b in zip(short, long_) if a == b)  # an abandoned start of the same line
            if sim >= TAKE_SIMILARITY or (n >= 3 and n >= 0.6 * len(short)):
                parent[root(j)] = root(i)
    groups: dict[int, list[dict]] = {}
    for i, s in enumerate(segs):
        groups.setdefault(root(i), []).append(s)
    out = []
    for members in groups.values():
        if len(members) < 2:
            continue
        longest = max(len([w for w in _take_words(m) if w not in FILLERS]) for m in members)
        takes = []
        for k, m in enumerate(sorted(members, key=lambda x: x["start"])):
            words = _take_words(m)
            spoken = [w for w in words if w not in FILLERS]
            probs = [w.get("prob", 0.8) for w in m.get("words") or []] or [0.8]
            fillers = sum(1 for w in words if w in FILLERS)
            pauses = sum(1 for s, e in quiet if s > m["start"] and e < m["end"])
            flubbed = any(f["t"] >= m["start"] and f["t"] <= m["end"] for f in markers)
            score = (45 * len(spoken) / longest + 35 * (sum(probs) / len(probs))
                     - 8 * min(fillers, 4) - 8 * pauses - (20 if flubbed else 0))
            reasons = []
            if len(spoken) < longest:
                reasons.append("cut short")
            if fillers:
                reasons.append(f"{fillers} filler word{'s' if fillers > 1 else ''}")
            if pauses:
                reasons.append(f"{pauses} pause{'s' if pauses > 1 else ''}")
            if flubbed:
                reasons.append("has a flub marker")
            takes.append({"start": round(m["start"], 2), "end": round(m["end"], 2), "text": m["text"],
                          "score": score, "notes": ", ".join(reasons) or "clean"})
        takes[-1]["score"] += 5  # the last take is usually the keeper
        for t in takes:
            t["score"] = max(0, min(100, round(t["score"])))
        for rank, t in enumerate(sorted(takes, key=lambda t: (-t["score"], -t["start"])), start=1):
            t["rank"] = rank
        out.append({"line": max(members, key=lambda m: len(_take_words(m)))["text"], "takes": takes})
    out.sort(key=lambda g: g["takes"][0]["start"])
    return out


def build(path: Path, settings: dict) -> dict:
    quiet = silences(path, settings.get("silence_db", -35), settings.get("silence_min", 0.7))
    segments = transcribe(path, settings)
    words = [w for s in segments for w in s.get("words") or []]
    markers = find_markers(words)
    flubs = sorted(markers + find_voiced_gaps(words, quiet, markers), key=lambda f: f["t"])
    return {"silences": quiet, "flubs": flubs, "takes": find_takes(segments, quiet, markers),
            "transcript": [{"start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"]}
                           for s in segments],
            "engine": f"whisper-{settings.get('whisper_model', 'small')} + silencedetect"}


# ---- whole project ------------------------------------------------------------------------

def candidates(project) -> list[dict]:
    return [e for e in project.entries()
            if e["kind"] in ("video", "audio") and e.get("state") == "done"
            and (e.get("speech") or {}).get("level") in ("some", "lots")
            and e.get("category") not in ("music", "sound-effects")]


def run(job, project, fids: list[str] | None = None) -> dict:
    from . import settings as settings_mod, submit
    cfg = settings_mod.load()
    todo = [e for e in candidates(project) if fids is None or e["fid"] in fids]
    done, errors = 0, []
    for i, e in enumerate(todo):
        job.progress(i, len(todo), f"Listening to {Path(e['path']).name}")
        try:
            m = build(project.root / e["path"], cfg)
            with project.lock:
                project.state["files"][e["fid"]]["flubmap"] = m
                project.save()
            done += 1
        except Exception as exc:
            errors.append(f"{e['path']}: {exc}")
    job.progress(len(todo), len(todo), "Writing _footage-master.md")
    master = submit.refresh_master(project) if done else None
    return {"mapped": done, "errors": errors, "master": master}


def fmt_t(t: float) -> str:
    m, s = divmod(t, 60)
    return f"{int(m)}:{s:04.1f}"
