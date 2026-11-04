#!/usr/bin/env python3
"""Stamp this checkout and invoke xtool (default: offline dev build)."""
import subprocess
import sys
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[1]
runpy.run_path(str(root / "scripts/stamp-native-build.py"))["stamp"]()
arguments = sys.argv[1:]
if arguments[:1] == ["--"]:
    arguments = arguments[1:]
raise SystemExit(subprocess.call(["xtool", *(arguments or ["dev", "build"])], cwd=root))
