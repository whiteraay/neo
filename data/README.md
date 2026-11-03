# NeoOutcome data pipeline

Population-level open data for Kazakhstan: births, deaths, infant and maternal mortality,
fertility, hospital capacity, population by age, and pregnancy density. It feeds the
**Regional Analytics** tab and gives priors and denominators for calibration. It is *not*
patient-level data, so it cannot train the 24 h deterioration model on its own.

```
data/
  sources.json        catalogue of every source: URL, licence, landing page
  requirements.txt    pipeline deps (separate venv, does not touch backend/)
  scripts/
    download.py       fetch all automatable sources -> raw/, write raw/MANIFEST.json
    statgov.py        parser for stat.gov.kz workbooks (wide, merged headers -> long)
    build.py          raw/ -> processed/
  raw/                (git-ignored) original files, untouched
  processed/          (git-ignored) analysis-ready tables
```

## Run

```bash
python -m venv data/.venv
data/.venv/Scripts/pip install -r data/requirements.txt     # Linux/macOS: data/.venv/bin/...
data/.venv/Scripts/python -I data/scripts/download.py       # --force to re-download
data/.venv/Scripts/python -I data/scripts/build.py
```

On Windows set `PYTHONIOENCODING=utf-8` if the console shows encoding errors.

**Refresh what the app shows** (download → build → train → export) with one command:

```bash
data/.venv/Scripts/python -I data/scripts/pipeline.py      # --skip-download to reuse raw/
```

`export_bundle.py` writes the same 20 KB JSON to `backend/data/regional_bundle.json` (served
by `GET /api/analytics/regions/forecast` and shown under the regional map in the analyst portal) and `frontend/src/lib/regional_bundle.json` (the frontend's
offline mode). Both files are committed, so Docker builds and offline demos work without
running the pipeline. After refreshing, rebuild or restart the backend and frontend, then
run `cd backend && python -m pytest tests -q`; one test fails if the two copies drift apart.

## Sources

| Source | What | Access | Licence |
|---|---|---|---|
| stat.gov.kz open data | 10 workbooks: population (1991–2026), population by single-year age × sex × urban/rural (2009–2026), births, deaths, infant deaths and IMR, TFR, maternal mortality, adolescent births, hospital beds, doctors | automatic | ASPIR open-data licence (stat.gov.kz/en/description) |
| WorldPop via HDX | 1 km pregnancies raster, **c.2015 estimates** (HDX labels it 2018, the production year) | automatic | CC BY 4.0, cite DOI 10.5258/SOTON/WP00612 |
| geoBoundaries KAZ ADM1 | 2017 oblast polygons, used to sum the raster | automatic | ODbL 1.0 |
| World Bank MICS 2015 (catalog 3005) | household, women, under-5 and birth-history microdata | **manual**: free account + confidentiality terms | UNICEF MICS terms |
| IHME GBD Results | neonatal disorders burden for Kazakhstan | **manual**: free IHME account | IHME free-of-charge non-commercial terms |

### Manual downloads

**MICS 2015:** log in at https://microdata.worldbank.org/index.php/catalog/3005/get-microdata
(or https://mics.unicef.org/surveys), download the SPSS datasets zip, and put it unchanged in
`data/raw/manual/worldbank_mics2015/`. `build.py` extracts the `.sav` files and writes
`processed/mics2015/<file>.parquet` plus `<file>.labels.json` (column and value labels).
The `bh` (birth history) file is the one that supports neonatal-mortality estimates by region.

**IHME GBD:** log in at https://vizhub.healthdata.org/gbd-results/ and use these settings:
- Location: *Kazakhstan*
- Cause: *Neonatal disorders* plus its children (preterm birth, birth asphyxia/trauma,
  neonatal sepsis, haemolytic disease, other)
- Measure: Deaths, DALYs, Incidence, Prevalence
- Metric: Number, Rate
- Age: *Early neonatal*, *Late neonatal*, *<1 year*
- Sex: Both
- Years: all

Download the CSV (zip is fine) into `data/raw/manual/ihme_gbd/`. `build.py` merges every
CSV into `processed/gbd_kazakhstan.parquet`. Note that GBD is national only for
Kazakhstan; there is no oblast breakdown.

## Outputs (`processed/`)

| File | Grain | Notes |
|---|---|---|
| `kz_oblast_year.csv` / `.parquet` | oblast × year (`oblast_code` `00` = country) | Main table, see columns below |
| `statgov_long.parquet` | region × breakdown × year, all levels including districts | Everything parsed, with `flag` and `value_raw` kept |
| `population_by_age.parquet` | oblast × area × sex × age × year | Single-year ages 0–100+ |
| `worldpop_pregnancies_adm1.csv` | 2017 oblast polygon | `covers_oblast_codes` lists the current oblasts each polygon became |
| `build_report.json` | — | Coverage and non-null counts per indicator |

`kz_oblast_year` columns: `births`, `births_reported_total`, `population` (1 Jan),
`crude_birth_rate`, `deaths`, `crude_death_rate`, `infant_deaths`, `infant_mortality_rate`
(published, per 1,000 live births), `imr_computed`, `total_fertility_rate`, `maternal_deaths`,
`maternal_mortality_ratio` (per 100k live births), `hospital_beds`, `doctors`,
`population_age0`, `women_15_49`, `beds_per_10k`, `doctors_per_10k`, `general_fertility_rate`.

### Oblast codes

These are KATO 2-digit prefixes, the same in every stat.gov.kz file: 10 Abay, 11 Akmola,
15 Aktobe, 19 Almaty Region, 23 Atyrau, 27 West Kazakhstan, 31 Zhambyl, 33 Zhetisu,
35 Karaganda, 39 Kostanay, 43 Kyzylorda, 47 Mangystau, 55 Pavlodar, 59 North Kazakhstan,
61 Turkistan, 62 Ulytau, 63 East Kazakhstan, 71 Astana, 75 Almaty, 79 Shymkent.
51 is South Kazakhstan, which existed before 2018. Abay, Zhetisu and Ulytau have been
separate oblasts since 2022; stat.gov.kz back-casts them where it can.

## Known data issues (read before modelling)

- **2016 births:** the published "Total" column is wrong in every region (national 331,939 vs
  401,031 from its own components; the published IMR implies about 400k). It is a misplaced
  copy of the 2025 totals: 19 of 21 rows match exactly, and Shymkent and the national row are
  off by the same 3,066. `births` uses the component sum, and `births_reported_total` keeps
  the original.
- **2022 IMR:** the published rate (6.51) does not equal published infant deaths ÷ births
  (7.81). The source is inconsistent; both columns are kept.
- **"-" in the source** means "no case" *and* "region did not exist yet". It is stored as NaN
  with `flag = "dash"`, so decide per series whether it means 0.
- **Latest year (2025)** may be preliminary; the infant-mortality workbook is updated monthly.
- **WorldPop** is c.2015 on 2017 boundaries, so pregnancies cannot be split into the 2022 oblasts.
  It is an exposure/denominator layer, not a time series.
- Hospital beds jump in 2020–2021 (COVID beds), and maternal mortality spikes in 2020–2021.
  These are real, not parsing errors.

## Regional model (`scripts/train_regional.py`)

```bash
data/.venv/Scripts/python -I data/scripts/train_regional.py   # after build.py
```

**Task:** forecast next year's infant mortality rate (per 1,000 live births) for each oblast,
and flag oblasts whose latest IMR was outside what the model expected a year earlier.

**Data:** 296 oblast-years (20 oblasts, target years 2011–2025). IMR before 2008 is excluded
because Kazakhstan adopted the WHO live-birth definition that year, and the national IMR
jumped from 14.6 to 20.7.

**Model selection:** eight candidates were compared with a rolling-origin backtest. Each test
year 2016–2025 was predicted by a model trained only on earlier years.

| model | MAE | skill vs persistence |
|---|---|---|
| **ridge + xgboost (blend)** | **0.995** | **12.6%** |
| random forest | 1.000 | 12.1% |
| Poisson GLM | 1.002 | 12.0% |
| xgboost | 1.010 | 11.3% |
| ridge | 1.054 | 7.4% |
| hist GBM | 1.064 | 6.5% |
| 3-year mean | 1.120 | 1.6% |
| persistence (last year's value) | 1.138 | — |

The blend beats persistence by 0.14 IMR points, with a bootstrap 95% CI of [0.05, 0.24].
The top four models are statistically tied, so the blend vs Poisson GLM difference is
0.007, CI [-0.04, 0.03]. The script re-selects automatically every time it runs. The 80%
interval is calibrated on out-of-sample errors (×0.79 to ×1.20 of the forecast), and its
backtest coverage is 80%.

**Outputs** go to `data/models/regional_imr/` (git-ignored): `model.joblib`, `metrics.json`,
`backtest_predictions.csv`, `forecast.csv`, `expected_vs_observed.csv`.

**Limits:**
- Year-to-year oblast IMR is dominated by Poisson noise. A small oblast has about 5,000 births,
  so ±1 IMR point is roughly ±5 deaths. Expect errors of about 1 point at best.
- 2025 is the worst backtest year for every ML model. The national IMR fell from 6.80 to 5.85,
  likely partly because 2025 data is preliminary. Rerun once the final figures are published.
