"""Run the whole regional pipeline: download -> build -> train -> export bundle.

Usage:  data/.venv/Scripts/python -I data/scripts/pipeline.py [--skip-download]
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["download.py", "build.py", "train_regional.py", "export_bundle.py"]


def main() -> int:
    steps = STEPS[1:] if "--skip-download" in sys.argv else STEPS
    for s in steps:
        print(f"\n=== {s} ===", flush=True)
        code = subprocess.call([sys.executable, "-I", str(HERE / s)])
        if code:
            print(f"\n{s} failed with exit code {code}; stopping.")
            return code
    return 0


if __name__ == "__main__":
    sys.exit(main())
