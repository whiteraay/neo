"""Download every automatable source listed in data/sources.json into data/raw/.

Usage:  data/.venv/Scripts/python -I data/scripts/download.py [--force]

Writes data/raw/MANIFEST.json (url, sha256, size, retrieval time, licence) so a
trained model can always be traced back to the exact files it was built from.
"""
import argparse
import datetime as dt
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import py7zr

DATA = Path(__file__).resolve().parent.parent
RAW = DATA / "raw"
UA = {"User-Agent": "Mozilla/5.0 (NeoOutcome data pipeline)"}

# Default file extension per source when the server does not tell us.
EXT = {"statgov": ".xlsx", "worldpop": ".7z", "geoboundaries": ".geojson"}


def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers=UA)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.replace(dest)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def extract_worldpop(archive: Path) -> None:
    """Extract only the GeoTIFF + README, refusing any path that leaves the target dir."""
    out = archive.parent / "extracted"
    out.mkdir(exist_ok=True)
    with py7zr.SevenZipFile(archive) as z:
        wanted = [n for n in z.getnames()
                  if "/" not in n and "\\" not in n and ".." not in n
                  and (n.endswith(".tif") or n == "README.txt")]
        z.extract(path=out, targets=wanted)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download files that already exist")
    args = ap.parse_args()

    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
    manifest_path = RAW / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    failures = []

    for source, spec in sources.items():
        if source == "manual":
            continue
        for name, f in spec["files"].items():
            dest = RAW / source / f"{name}{EXT[source]}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            key = f"{source}/{dest.name}"
            downloaded = False
            if dest.exists() and not args.force:
                print(f"skip  {key} (exists)")
            else:
                print(f"get   {key} <- {f['url']}")
                try:
                    fetch(f["url"], dest)
                except Exception as e:  # keep going; report at the end
                    print(f"FAIL  {source}/{name}: {e}")
                    failures.append(f"{source}/{name}")
                    continue
                downloaded = True
            now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            manifest[key] = {
                "url": f["url"], "page": f.get("page"), "license": spec["license"],
                "bytes": dest.stat().st_size, "sha256": sha256(dest),
                "retrieved_at": now if downloaded else manifest.get(key, {}).get("retrieved_at", now),
            }
            if source == "worldpop":
                extract_worldpop(dest)

    for name, m in sources["manual"].items():
        d = DATA / m["drop_into"]
        d.mkdir(parents=True, exist_ok=True)
        n = sum(1 for p in d.iterdir() if p.is_file())
        print(f"manual {name}: {n} file(s) in {d.relative_to(DATA)}"
              + ("" if n else f"  -> download from {m['page']}"))

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nmanifest: {manifest_path.relative_to(DATA)}  ({len(manifest)} files)")
    if failures:
        print("failed:", ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
