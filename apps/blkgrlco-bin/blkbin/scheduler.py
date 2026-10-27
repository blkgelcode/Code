"""Timed work while the app is open: retention pulls (48h / 7d after posting) and the Sunday
channel audit. Runs once at start, so anything missed while the Mac was asleep catches up,
then every 30 minutes."""
from __future__ import annotations

import logging
import threading

log = logging.getLogger("blkbin.scheduler")
INTERVAL = 30 * 60
_stop = threading.Event()
last: dict = {"retention": [], "audit": None, "error": None}


def tick() -> None:
    from . import retention, strategy
    try:
        last["retention"] = retention.run_due()
        if last["retention"]:
            log.info("retention pulled: %s", ", ".join(last["retention"]))
        ran = strategy.run_sunday_audit_if_due()
        if ran:
            last["audit"] = ran
            log.info("Sunday channel audit: %s", ran)
        last["error"] = None
    except Exception as exc:  # never let a bad pull stop the loop
        log.warning("scheduled work failed: %s", exc)
        last["error"] = str(exc)[:200]


def start() -> threading.Thread:
    def loop():
        while not _stop.is_set():
            tick()
            _stop.wait(INTERVAL)

    t = threading.Thread(target=loop, name="scheduler", daemon=True)
    t.start()
    return t
