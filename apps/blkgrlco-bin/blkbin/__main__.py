"""Start the app:  python -m blkbin [--port 4321] [--open /path/to/project]
Or run the command-line tools:  python -m blkbin.cli --help
"""
from __future__ import annotations

import argparse
import logging

from . import scheduler
from .server import PORT, serve


def main() -> None:
    ap = argparse.ArgumentParser(prog="blkbin")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--open", dest="open_path", help="project folder to open on start")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
    httpd = serve(args.port, args.open_path)
    scheduler.start()  # retention pulls + Sunday audit; catches up on anything missed while the Mac was off
    print(f"BLKGRLCO Bin is running at http://localhost:{args.port}  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
