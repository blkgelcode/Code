"""Native macOS folder picker via AppleScript."""
from __future__ import annotations

import os
import shutil
import subprocess


def available() -> bool:
    return shutil.which("osascript") is not None


def choose_folder(default_location: str | None = None) -> str | None:
    """Show Finder's folder dialog. Returns a POSIX path, or None if cancelled."""
    if not available():
        return None
    script = ['tell me to activate', 'set p to choose folder with prompt "Pick a video\'s project folder"']
    if default_location and os.path.isdir(default_location):
        loc = default_location.replace('"', '\\"')
        script[1] += f' default location POSIX file "{loc}"'
    script.append("POSIX path of p")
    args = ["osascript"]
    for line in script:
        args += ["-e", line]
    out = subprocess.run(args, capture_output=True, text=True, timeout=600)
    if out.returncode != 0:
        return None
    return out.stdout.strip().rstrip("/") or None
