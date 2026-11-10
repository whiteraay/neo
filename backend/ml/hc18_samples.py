"""Copy a few HELD-OUT validation images of HC18 (same subject split as train_hc18.py) into data/hc18_samples for the UI.

    python -m ml.hc18_samples --data ../data/raw/hc18
HC18 is CC BY 4.0 (van den Heuvel et al. 2018, https://zenodo.org/records/1327317); attribution is kept in samples.json.
"""
import argparse
import csv
import json
import random
import shutil
from pathlib import Path

from ml.train_hc18 import subject

OUT = Path(__file__).resolve().parents[1] / "data" / "hc18_samples"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--n", type=int, default=8)
    args = ap.parse_args()
    root = Path(args.data)
    rows = list(csv.DictReader(open(root / "training_set_pixel_size_and_HC.csv")))
    subjects = sorted({subject(r["filename"]) for r in rows})
    random.Random(args.seed).shuffle(subjects)
    val = set(subjects[: len(subjects) // 10])
    held = sorted((r for r in rows if subject(r["filename"]) in val), key=lambda r: float(r["head circumference (mm)"]))
    step = (len(held) - 1) / (args.n - 1)
    picked = [held[round(i * step)] for i in range(args.n)]  # spread over the whole HC range (all trimesters)
    OUT.mkdir(parents=True, exist_ok=True)
    out = []
    for r in picked:
        shutil.copy(root / "training_set" / r["filename"], OUT / r["filename"])
        out.append({"filename": r["filename"], "pixel_size_mm": float(r["pixel size(mm)"]), "reference_hc_mm": float(r["head circumference (mm)"]),
                    "split": "validation (held out)", "source": "HC18, van den Heuvel et al. 2018, CC BY 4.0"})
    (OUT / "samples.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print([(x["filename"], x["reference_hc_mm"]) for x in out])


if __name__ == "__main__":
    main()
