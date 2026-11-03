"""Turn data/raw/ into analysis-ready tables in data/processed/.

Usage:  data/.venv/Scripts/python -I data/scripts/build.py

Outputs
  statgov_long.parquet            every stat.gov.kz series, tidy (one row per region x breakdown x year)
  population_by_age.parquet       single-year age x sex x urban/rural population by oblast, 2009-2026
  kz_oblast_year.csv/.parquet     one row per oblast x year with the indicators the app needs
  worldpop_pregnancies_adm1.csv   WorldPop c.2015 pregnancies summed over 2017 oblast boundaries
  gbd_kazakhstan.parquet          (only if IHME GBD exports were dropped into raw/manual/ihme_gbd/)
  mics2015/*.parquet              (only if MICS 2015 SPSS files were dropped into raw/manual/worldbank_mics2015/)
  build_report.json               row counts, year coverage and missingness per indicator
"""
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import statgov  # noqa: E402

DATA = Path(__file__).resolve().parent.parent
RAW, OUT = DATA / "raw", DATA / "processed"

# Current oblast-level units (KATO 2-digit prefix). 51 is South Kazakhstan, abolished in 2018
# when Shymkent (79) became a city of republican significance and the rest became Turkistan (61).
OBLASTS = {
    "00": "Republic of Kazakhstan", "10": "Abay", "11": "Akmola", "15": "Aktobe", "19": "Almaty Region",
    "23": "Atyrau", "27": "West Kazakhstan", "31": "Zhambyl", "33": "Zhetisu", "35": "Karaganda",
    "39": "Kostanay", "43": "Kyzylorda", "47": "Mangystau", "51": "South Kazakhstan (pre-2018)",
    "55": "Pavlodar", "59": "North Kazakhstan", "61": "Turkistan", "62": "Ulytau",
    "63": "East Kazakhstan", "71": "Astana", "75": "Almaty", "79": "Shymkent",
}

# Panel column -> (dataset, sheet, section, breakdown). Breakdown None = any (first non-null wins,
# preferring the empty breakdown). Values are oblast/country totals.
SERIES = {
    "population":              ("population", ("1991-2008", "2009-2026"), "All population", ""),
    "births_reported_total":   ("births", "Number of births", "", "Total"),
    "crude_birth_rate":        ("births", "Crude fertility rate", "", "Total"),
    "deaths":                  ("deaths", "Number of deaths", "", "All population"),
    "crude_death_rate":        ("deaths", "Crude mortality rate", "", "All population"),
    "infant_deaths":           ("infant_mortality", "Number of children", "all population", None),
    "infant_mortality_rate":   ("infant_mortality", "Infant mortality rate", "all population", None),
    "total_fertility_rate":    ("fertility", "Indicator", "All population", None),
    "maternal_deaths":         ("maternal_mortality", None, "", "Number of deaths"),
    "maternal_mortality_ratio": ("maternal_mortality", None, "", "per 100 thousand live births"),
    "hospital_beds":           ("hospital_beds", "Indicator", "", ""),
    "doctors":                 ("doctors", "Indicator", "", ""),
}

# 2017 geoBoundaries polygons -> the current oblast codes they now cover.
ADM1_TO_KATO = {
    "KZ-AKM": ["11"], "KZ-AKT": ["15"], "KZ-ALM": ["19", "33"], "KZ-ATY": ["23"], "KZ-ZAP": ["27"],
    "KZ-ZHA": ["31"], "KZ-KAR": ["35", "62"], "KZ-KUS": ["39"], "KZ-KZY": ["43"], "KZ-MAN": ["47"],
    "KZ-YUZ": ["61", "79"], "KZ-PAV": ["55"], "KZ-SEV": ["59"], "KZ-VOS": ["63", "10"],
    "KZ-AST": ["71"], "KZ-ALA": ["75"],
}


def build_statgov() -> tuple[pd.DataFrame, pd.DataFrame]:
    frames = []
    for p in sorted((RAW / "statgov").glob("*.xlsx")):
        if p.stem == "population_detailed":
            continue
        print(f"  parse {p.name}")
        frames.append(statgov.parse_workbook(p, p.stem))
    long = pd.concat(frames, ignore_index=True)
    long["oblast_name"] = long["oblast_code"].map(OBLASTS)
    long.to_parquet(OUT / "statgov_long.parquet", index=False)

    print("  parse population_detailed.xlsx")
    age = statgov.parse_population_by_age(RAW / "statgov" / "population_detailed.xlsx")
    age["oblast_name"] = age["oblast_code"].map(OBLASTS)
    age.to_parquet(OUT / "population_by_age.parquet", index=False)
    return long, age


def pick(long: pd.DataFrame, dataset, sheet, section, breakdown) -> pd.Series:
    m = (long.dataset == dataset) & long.level.isin(["oblast", "country"]) & long.value.notna()
    if sheet is not None:
        m &= long.sheet.isin(sheet if isinstance(sheet, tuple) else [sheet])
    m &= long.section.str.lower() == section.lower()
    if breakdown is not None:
        m &= long.breakdown == breakdown
    d = long[m].assign(_pref=lambda x: (x.breakdown != "").astype(int))
    d = d.sort_values("_pref").drop_duplicates(["oblast_code", "year"])
    return d.set_index(["oblast_code", "year"])["value"]


def build_panel(long: pd.DataFrame, age: pd.DataFrame) -> pd.DataFrame:
    panel = pd.DataFrame({name: pick(long, *spec) for name, spec in SERIES.items()})

    # The published 2016 "Total" births column disagrees with its own sex x marriage components
    # (national 331,939 vs 401,031; the published IMR implies ~400k), so births = sum of components.
    b = long[(long.dataset == "births") & (long.sheet == "Number of births")
             & long.level.isin(["oblast", "country"]) & (long.breakdown != "Total")]
    parts = b.groupby(["oblast_code", "year"]).value.sum(min_count=4)
    panel.insert(1, "births", parts.reindex(panel.index).fillna(panel.births_reported_total))

    tot = age[(age.area == "total") & (age.level.isin(["oblast", "country"]))]
    panel["population_age0"] = tot[(tot.sex == "total") & (tot.age_years == 0)] \
        .groupby(["oblast_code", "year"]).value.sum()
    panel["women_15_49"] = tot[(tot.sex == "female") & tot.age_years.between(15, 49)] \
        .groupby(["oblast_code", "year"]).value.sum().replace(0, np.nan)

    # Derived rates, so the app does not need to recompute them.
    panel["imr_computed"] = panel.infant_deaths / panel.births * 1000
    panel["beds_per_10k"] = panel.hospital_beds / panel.population * 1e4
    panel["doctors_per_10k"] = panel.doctors / panel.population * 1e4
    panel["general_fertility_rate"] = panel.births / panel.women_15_49 * 1000

    panel = panel.reset_index().rename(columns={"level_0": "oblast_code", "level_1": "year"})
    panel.index.name = None
    panel.insert(1, "oblast_name", panel.oblast_code.map(OBLASTS))
    panel = panel.sort_values(["oblast_code", "year"]).reset_index(drop=True)
    panel.to_parquet(OUT / "kz_oblast_year.parquet", index=False)
    panel.to_csv(OUT / "kz_oblast_year.csv", index=False, encoding="utf-8")
    return panel


def build_worldpop() -> pd.DataFrame | None:
    import rasterio
    from rasterio.features import rasterize

    tifs = list((RAW / "worldpop" / "extracted").glob("*.tif"))
    geo = RAW / "geoboundaries" / "kaz_adm1.geojson"
    if not tifs or not geo.exists():
        print("  worldpop: raster or boundaries missing, skipped")
        return None
    feats = json.loads(geo.read_text(encoding="utf-8"))["features"]
    with rasterio.open(tifs[0]) as src:
        band = src.read(1, masked=True)
        zones = rasterize(((f["geometry"], i + 1) for i, f in enumerate(feats)),
                          out_shape=src.shape, transform=src.transform, fill=0, dtype="int32")
    vals = band.filled(0).astype("float64")
    vals[vals < 0] = 0
    sums = np.bincount(zones.ravel(), weights=vals.ravel(), minlength=len(feats) + 1)
    df = pd.DataFrame([{
        "adm1_iso": f["properties"]["shapeISO"], "adm1_name": f["properties"]["shapeName"],
        "covers_oblast_codes": ",".join(ADM1_TO_KATO[f["properties"]["shapeISO"]]),
        "pregnancies_c2015": round(sums[i + 1], 1),
    } for i, f in enumerate(feats)]).sort_values("adm1_iso")
    df["share_of_national"] = df.pregnancies_c2015 / vals.sum()
    df.attrs["outside_polygons"] = float(sums[0])
    df.to_csv(OUT / "worldpop_pregnancies_adm1.csv", index=False, encoding="utf-8")
    print(f"  worldpop: national {vals.sum():,.0f} pregnancies, {sums[0]:,.0f} fell outside polygons")
    return df


def _csv_members(folder: Path):
    """Yield (name, DataFrame) for every CSV in folder, including CSVs inside zip exports."""
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() == ".csv":
            yield p.name, pd.read_csv(p)
        elif p.suffix.lower() == ".zip":
            with zipfile.ZipFile(p) as z:
                for n in z.namelist():
                    if n.lower().endswith(".csv"):
                        with z.open(n) as f:
                            yield f"{p.name}:{n}", pd.read_csv(f)


def build_gbd() -> pd.DataFrame | None:
    folder = RAW / "manual" / "ihme_gbd"
    frames = [df.assign(source_file=name) for name, df in _csv_members(folder)] if folder.exists() else []
    if not frames:
        print("  gbd: no exports in raw/manual/ihme_gbd/, skipped")
        return None
    gbd = pd.concat(frames, ignore_index=True)
    need = {"measure_name", "location_name", "cause_name", "metric_name", "year", "val"}
    missing = need - set(gbd.columns)
    if missing:
        print(f"  gbd: WARNING columns missing {sorted(missing)}; export with 'name' columns enabled")
    gbd.to_parquet(OUT / "gbd_kazakhstan.parquet", index=False)
    print(f"  gbd: {len(gbd):,} rows from {len(frames)} file(s)")
    return gbd


def build_mics() -> list[str]:
    folder = RAW / "manual" / "worldbank_mics2015"
    if not folder.exists():
        return []
    extracted = folder / "extracted"
    for z in folder.glob("*.zip"):
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                base = Path(n).name  # flatten, never trust archive paths
                if base.lower().endswith((".sav", ".dta")):
                    extracted.mkdir(exist_ok=True)
                    (extracted / base).write_bytes(zf.read(n))
    files = [p for d in (folder, extracted) if d.exists()
             for p in d.iterdir() if p.suffix.lower() in (".sav", ".dta")]
    if not files:
        print("  mics: no SPSS/Stata files in raw/manual/worldbank_mics2015/, skipped")
        return []
    import pyreadstat

    out = OUT / "mics2015"
    out.mkdir(exist_ok=True)
    done = []
    for p in files:
        reader = pyreadstat.read_sav if p.suffix.lower() == ".sav" else pyreadstat.read_dta
        df, meta = reader(str(p))
        df.to_parquet(out / f"{p.stem.lower()}.parquet", index=False)
        (out / f"{p.stem.lower()}.labels.json").write_text(json.dumps({
            "columns": dict(zip(meta.column_names, meta.column_labels)),
            "values": {k: {str(a): b for a, b in v.items()} for k, v in meta.variable_value_labels.items()},
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        done.append(p.stem.lower())
        print(f"  mics: {p.name} -> {len(df):,} rows x {df.shape[1]} cols")
    return done


def main() -> int:
    OUT.mkdir(exist_ok=True)
    print("stat.gov.kz")
    long, age = build_statgov()
    panel = build_panel(long, age)
    print("worldpop")
    wp = build_worldpop()
    print("manual sources")
    gbd = build_gbd()
    mics = build_mics()

    obl = panel[panel.oblast_code != "00"]
    report = {
        "statgov_long_rows": len(long),
        "population_by_age_rows": len(age),
        "panel": {
            "rows": len(panel), "oblasts": int(obl.oblast_code.nunique()),
            "indicators": {c: {"years": f"{int(panel.loc[panel[c].notna(), 'year'].min())}-"
                                         f"{int(panel.loc[panel[c].notna(), 'year'].max())}",
                               "non_null": int(panel[c].notna().sum())}
                           for c in panel.columns[3:] if panel[c].notna().any()},
        },
        "worldpop_adm1_rows": None if wp is None else len(wp),
        "gbd_rows": None if gbd is None else len(gbd),
        "mics_files": mics,
    }
    (OUT / "build_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["panel"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
