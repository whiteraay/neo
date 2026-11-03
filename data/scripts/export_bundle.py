"""Export the regional bundle the app serves: real indicators + IMR forecasts + model metrics.

Usage:  data/.venv/Scripts/python -I data/scripts/export_bundle.py   (after build.py and train_regional.py)

Writes the same JSON to
  backend/data/regional_bundle.json         served by GET /api/analytics/regions/forecast
  frontend/src/lib/regional_bundle.json     used by the frontend's offline mode
The Docker build contexts are backend/ and frontend/, so neither can read data/ directly,
and the backend does not need pandas or the pickled model at runtime.
"""
import datetime as dt
import json
import math
import sys
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent
ROOT = DATA.parent
MODEL = DATA / "models" / "regional_imr"
TARGETS = [ROOT / "backend" / "data" / "regional_bundle.json",
           ROOT / "frontend" / "src" / "lib" / "regional_bundle.json"]
SCHEMA = 1
TREND_FROM = 2008  # IMR is not comparable before the 2008 switch to the WHO live-birth definition

NAMES = {  # KATO oblast code -> (platform region id, English, Kazakh, Russian)
    "10": ("abai", "Abay", "Абай", "Абайская"),
    "11": ("akmola", "Akmola", "Ақмола", "Акмолинская"),
    "15": ("aktobe", "Aktobe", "Ақтөбе", "Актюбинская"),
    "19": ("almaty_region", "Almaty Region", "Алматы облысы", "Алматинская"),
    "23": ("atyrau", "Atyrau", "Атырау", "Атырауская"),
    "27": ("west", "West Kazakhstan", "Батыс Қазақстан", "Западно-Казахстанская"),
    "31": ("jambyl", "Zhambyl", "Жамбыл", "Жамбылская"),
    "33": ("jetisu", "Zhetisu", "Жетісу", "Жетысуская"),
    "35": ("karaganda", "Karaganda", "Қарағанды", "Карагандинская"),
    "39": ("kostanay", "Kostanay", "Қостанай", "Костанайская"),
    "43": ("kyzylorda", "Kyzylorda", "Қызылорда", "Кызылординская"),
    "47": ("mangystau", "Mangystau", "Маңғыстау", "Мангистауская"),
    "55": ("pavlodar", "Pavlodar", "Павлодар", "Павлодарская"),
    "59": ("north", "North Kazakhstan", "Солтүстік Қазақстан", "Северо-Казахстанская"),
    "61": ("turkestan", "Turkistan", "Түркістан", "Туркестанская"),
    "62": ("ulytau", "Ulytau", "Ұлытау", "Улытауская"),
    "63": ("east", "East Kazakhstan", "Шығыс Қазақстан", "Восточно-Казахстанская"),
    "71": ("astana", "Astana", "Астана", "Астана"),
    "75": ("almaty_city", "Almaty", "Алматы", "Алматы"),
    "79": ("shymkent", "Shymkent", "Шымкент", "Шымкент"),
}
LATEST_FIELDS = {  # bundle key -> panel column
    "imr": "infant_mortality_rate", "births": "births", "infant_deaths": "infant_deaths",
    "population": "population", "tfr": "total_fertility_rate",
    "maternal_mortality_ratio": "maternal_mortality_ratio",
    "beds_per_10k": "beds_per_10k", "doctors_per_10k": "doctors_per_10k",
}


def num(v, nd=2):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return int(round(float(v))) if nd == 0 else round(float(v), nd)


def latest(d: pd.DataFrame, data_year: int) -> dict:
    """Value at data_year, or the most recent earlier value, with the year it comes from."""
    out = {}
    for key, col in LATEST_FIELDS.items():
        s = d[(d.year <= data_year) & d[col].notna()]
        if len(s):
            row = s.iloc[-1]
            out[key] = num(row[col], 0 if key in ("births", "infant_deaths", "population") else 2)
            if int(row.year) != data_year:
                out[f"{key}_year"] = int(row.year)
        else:
            out[key] = None
    return out


def main() -> int:
    panel = pd.read_parquet(DATA / "processed" / "kz_oblast_year.parquet")
    metrics = json.loads((MODEL / "metrics.json").read_text(encoding="utf-8"))
    forecast = pd.read_csv(MODEL / "forecast.csv", dtype={"oblast_code": str}).set_index("oblast_code")
    expected = pd.read_csv(MODEL / "expected_vs_observed.csv", dtype={"oblast_code": str}).set_index("oblast_code")
    manifest = json.loads((DATA / "raw" / "MANIFEST.json").read_text(encoding="utf-8"))

    data_year = int(panel.loc[panel.infant_mortality_rate.notna(), "year"].max())
    trend = lambda d: [{"year": int(r.year), "imr": num(r.infant_mortality_rate)}  # noqa: E731
                       for r in d[(d.year >= TREND_FROM) & d.infant_mortality_rate.notna()].itertuples()]

    regions = []
    for code, (rid, en, kz, ru) in NAMES.items():
        d = panel[panel.oblast_code == code].sort_values("year")
        f, e = forecast.loc[code], expected.loc[code]
        regions.append({
            "id": rid, "code": code, "en": en, "kz": kz, "ru": ru,
            "latest": latest(d, data_year),
            "trend": trend(d),
            "forecast": {"year": int(f.forecast_year), "imr": num(f.forecast),
                         "lo80": num(f.lo80), "hi80": num(f.hi80)},
            "expected": {"year": int(e.year), "observed": num(e.observed_imr), "expected": num(e.expected_imr),
                         "lo80": num(e.lo80), "hi80": num(e.hi80), "status": e.status,
                         "excess_deaths": num(e.excess_deaths_est, 0)},
        })

    nat = panel[panel.oblast_code == "00"].sort_values("year")
    # National forecast = births-weighted mean of oblast forecasts (the model is fitted per oblast).
    w = {r["code"]: r["latest"]["births"] or 0 for r in regions}
    nat_fc = {k: num(sum(r["forecast"][k] * w[r["code"]] for r in regions) / sum(w.values()))
              for k in ("imr", "lo80", "hi80")}

    ov = metrics["overall"]
    best = metrics["selected_model"]
    bundle = {
        "schema": SCHEMA,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "data_year": data_year,
        "metric": {
            "key": "imr", "label": "Infant mortality rate", "unit": "deaths under 1 year per 1,000 live births",
            "note": "stat.gov.kz publishes infant (<1 year) mortality by oblast; neonatal (<28 days) "
                    "mortality is not published at oblast level.",
        },
        "national": {"latest": latest(nat, data_year), "trend": trend(nat),
                     "forecast": {"year": regions[0]["forecast"]["year"], **nat_fc,
                                  "method": "births-weighted mean of oblast forecasts"}},
        "regions": regions,
        "model": {
            "task": metrics["task"], "selected": best,
            "mae": num(ov[best]["mae"], 3), "rmse": num(ov[best]["rmse"], 3),
            "skill_vs_persistence": num(ov[best]["skill_vs_persistence"], 3),
            "interval": "80%", "interval_coverage": num(metrics["interval80"]["backtest_coverage"], 3),
            "training_rows": metrics["training_rows"],
            "trained_through": int(expected.year.max()),
            "backtest_years": f"{min(map(int, metrics['mae_by_test_year'][best]))}-"
                              f"{max(map(int, metrics['mae_by_test_year'][best]))}",
            "ranking": [{"model": m, "mae": num(ov[m]["mae"], 3)} for m in metrics["ranking"]],
        },
        "sources": [
            {"name": "Bureau of National Statistics (ASPIR)", "url": "https://stat.gov.kz/en/open-data/",
             "detail": "Births, deaths, infant & maternal mortality, fertility, beds, doctors, population by oblast",
             "license": "ASPIR open-data licence",
             "retrieved_at": min(v["retrieved_at"] for k, v in manifest.items() if k.startswith("statgov/"))},
            {"name": "WorldPop pregnancies (via HDX)", "url": "https://data.humdata.org/dataset/worldpop-pregnancies-for-kazakhstan",
             "detail": "1 km pregnancy estimates, c.2015", "license": "CC BY 4.0"},
            {"name": "UNICEF MICS 2015 (World Bank Microdata)", "url": "https://microdata.worldbank.org/index.php/catalog/3005",
             "detail": "Household survey microdata, registration required", "license": "MICS terms"},
            {"name": "IHME Global Burden of Disease", "url": "https://vizhub.healthdata.org/gbd-results/",
             "detail": "Neonatal disorders burden, national, registration required", "license": "IHME terms"},
        ],
        "caveats": [
            f"{data_year} figures may be preliminary; the latest year was the hardest backtest year for the model.",
            "Year-to-year oblast IMR is dominated by random variation in small oblasts (about +/-1 per 1,000).",
            "Hospital beds and doctors are all-specialty totals, not NICU beds or neonatologists.",
        ],
    }

    text = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    for t in TARGETS:
        t.parent.mkdir(parents=True, exist_ok=True)
        t.write_text(text, encoding="utf-8")
        print(f"wrote {t.relative_to(ROOT)} ({len(text.encode()) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
