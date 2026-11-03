"""Regional open-data bundle: official stat.gov.kz indicators + IMR forecasts per oblast.

The bundle is produced offline by `data/scripts/pipeline.py` (download -> build -> train ->
export) and committed as `backend/data/regional_bundle.json`, so the API needs neither
network access nor the training stack at runtime. Re-run the pipeline to refresh it.
"""
import json
from functools import lru_cache
from pathlib import Path

from config import get_settings

SCHEMA = 1
DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "regional_bundle.json"


class BundleUnavailable(RuntimeError):
    pass


@lru_cache
def load_bundle() -> dict:
    path = Path(get_settings().regional_bundle_path or DEFAULT_PATH)
    try:
        bundle = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise BundleUnavailable(f"{path.name} not found; run data/scripts/pipeline.py") from e
    except json.JSONDecodeError as e:
        raise BundleUnavailable(f"{path.name} is not valid JSON: {e}") from e
    if bundle.get("schema") != SCHEMA:
        raise BundleUnavailable(f"{path.name} has schema {bundle.get('schema')}, expected {SCHEMA}")
    for key in ("data_year", "national", "regions", "model", "sources"):
        if key not in bundle:
            raise BundleUnavailable(f"{path.name} is missing '{key}'")
    return bundle
