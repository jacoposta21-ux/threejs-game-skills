#!/usr/bin/env python3
"""Zip the production build (dist/) into a CrazyGames-ready upload.

CrazyGames expects a ZIP whose root contains index.html. Source maps are
excluded from the upload. Usage: python3 scripts/package_crazygames.py
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT_DIR = ROOT / "release"


def main() -> int:
    index = DIST / "index.html"
    if not index.exists():
        print("dist/index.html not found. Run `npm run build` first.", file=sys.stderr)
        return 1
    version = json.loads((ROOT / "package.json").read_text())["version"]
    OUT_DIR.mkdir(exist_ok=True)
    target = OUT_DIR / f"little-night-crazygames-v{version}.zip"
    files = sorted(p for p in DIST.rglob("*") if p.is_file() and not p.name.endswith(".map"))
    total = 0
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in files:
            zf.write(path, path.relative_to(DIST).as_posix())
            total += path.stat().st_size
    html = index.read_text()
    if 'src="/' in html or 'href="/' in html:
        print("warning: absolute asset paths in index.html; set Vite base to './'", file=sys.stderr)
    print(f"{target.relative_to(ROOT)}  files={len(files)}  raw={total / 1024:.0f} KiB  zip={target.stat().st_size / 1024:.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
