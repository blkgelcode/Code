"""Long-running work (ingest, fix + proxies, flub maps, strategy research) in the background.

Each job has an id the browser polls for progress. One job of each kind at a time, so a
double click can't start two ingests of the same card.
"""
from __future__ import annotations

import logging
import secrets
import threading
import time
import traceback

log = logging.getLogger("blkbin.jobs")

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


class JobError(Exception):
    pass


class Job:
    """Handed to the worker function so it can report progress."""

    def __init__(self, record: dict):
        self.record = record

    def progress(self, done: int, total: int, message: str = "") -> None:
        with _lock:
            self.record.update(done=done, total=total, message=message)

    def note(self, message: str) -> None:
        with _lock:
            self.record["message"] = message


def start(kind: str, fn, *args, **kwargs) -> dict:
    with _lock:
        for j in _jobs.values():
            if j["kind"] == kind and j["state"] == "running":
                raise JobError("That's already running. Wait for it to finish.")
        jid = f"{kind}-{secrets.token_hex(4)}"
        record = {"id": jid, "kind": kind, "state": "running", "done": 0, "total": 0, "message": "Starting…",
                  "result": None, "error": None, "started": time.time()}
        _jobs[jid] = record

    def run():
        try:
            result = fn(Job(record), *args, **kwargs)
            with _lock:
                record.update(state="done", result=result, message="Done")
        except Exception as exc:  # reported to the browser, logged in full here
            log.error("job %s failed: %s", jid, traceback.format_exc())
            with _lock:
                record.update(state="error", error=str(exc)[:500])

    threading.Thread(target=run, name=jid, daemon=True).start()
    return snapshot(jid)


def snapshot(jid: str) -> dict:
    with _lock:
        if jid not in _jobs:
            raise KeyError(jid)
        return dict(_jobs[jid])


def latest(kind: str) -> dict | None:
    with _lock:
        mine = [j for j in _jobs.values() if j["kind"] == kind]
        return dict(max(mine, key=lambda j: j["started"])) if mine else None


def wait(jid: str, timeout: float = 600) -> dict:
    """For tests and the command line."""
    end = time.time() + timeout
    while time.time() < end:
        j = snapshot(jid)
        if j["state"] != "running":
            return j
        time.sleep(0.05)
    raise TimeoutError(jid)
