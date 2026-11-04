#!/usr/bin/env python3
"""Stamp the source checkout into an app resource; never inspect environment secrets."""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "ios/Braive/Resources/BuildIdentity.json"


def stamp(output=DEFAULT_OUTPUT):
    # Docker sees the files but cannot follow a Windows worktree's gitdir.
    # Its caller supplies this non-secret source stamp from the host checkout.
    revision = os.environ.get("BRAIVE_SOURCE_REVISION")
    if revision is not None:
        if not re.fullmatch(r"[0-9a-f]{7,40}(?:-dirty)?", revision):
            raise ValueError("BRAIVE_SOURCE_REVISION must be a Git source revision")
    else:
        revision = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        dirty = bool(subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, text=True).strip())
        revision += "-dirty" if dirty else ""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source_revision": revision}) + "\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    stamp(parser.parse_args().output)
