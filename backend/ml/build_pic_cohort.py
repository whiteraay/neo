"""
Build the 31-feature training cohort from the credentialed PIC v1.1.0 tables.

PIC (Zeng et al., 2020) is distributed through PhysioNet under a data-use agreement, so neither the tables
nor anything row-level built from them may enter this repository or the Docker image. --out must be outside it:

    python ml/build_pic_cohort.py --pic-dir ~/physionet/picdb-1.1.0/V1.1.0 --out ~/physionet/derived/pic_neonatal_cohort.csv

One row per NICU stay and landmark (12 h, 24 h, then daily to day 7 after ICU admission). Features use only what
was recorded before the landmark: the latest vital in the previous 24 h, the latest lab in the previous 72 h.

PIC has no ventilator data, FiO2 only where a blood gas recorded it, and no gestational age, Apgar or delivery mode,
so those columns stay empty. `birth_weight_g` holds the first charted weight, not a true birth weight.

Labels, for the 24 h after the landmark:
  label_strict      in-hospital death, or the first vasoactive prescription of the stay
  deteriorated_24h  label_strict, or a decompensation that was not present in the 24 h before the landmark:
                    pH < 7.25 with pCO2 >= 65, pH < 7.15, lactate >= 8, or FiO2 >= 60 %
The decompensation thresholds stand in for the missing ventilation data and need clinical review.
"""
from __future__ import annotations

import argparse, hashlib, json
from pathlib import Path

import numpy as np, pandas as pd

LANDMARKS = [12, 24, 48, 72, 96, 120, 144, 168]
VITAL_LOOKBACK, LAB_LOOKBACK = 24, 72
CHART_ITEMS = {"temperature": [1001], "heart_rate": [1003, 1002], "resp_rate": [1004], "spo2": [1006], "sbp": [1016], "dbp": [1015], "weight_kg": [1014], "urine_ml": [1008]}
LAB_ITEMS = {"ph": [5237, 5238], "pco2": [5235, 5236], "po2": [5239, 5244], "hco3": [5248, 5224], "base_excess": [5249, 5211], "lactate": [5227], "glucose": [5223], "hemoglobin": [5099, 5257],
             "wbc": [5141], "platelets": [5129], "crp": [5626, 5821], "sodium": [5230], "potassium": [5226], "creatinine": [5041, 5032], "bilirubin": [5255, 5075], "fio2": [5222]}
LIMITS = {"temperature": (30, 43), "heart_rate": (30, 300), "resp_rate": (5, 150), "spo2": (40, 100), "sbp": (15, 160), "dbp": (5, 120), "weight_kg": (0.3, 8), "urine_ml": (0, 3000), "ph": (6.5, 8), "pco2": (5, 150),
          "po2": (5, 600), "hco3": (1, 60), "base_excess": (-35, 30), "lactate": (0, 35), "glucose": (0.5, 40), "hemoglobin": (30, 300), "wbc": (0, 150), "platelets": (1, 1500), "crp": (0, 400), "sodium": (100, 180),
          "potassium": (1, 12), "creatinine": (5, 800), "bilirubin": (0, 900), "fio2": (21, 100)}
VASOACTIVE = r"dopamin|dobutamin|epinephrin|adrenalin|milrinon"


def nicu_stays(d: Path) -> pd.DataFrame:
    pat = pd.read_csv(d / "PATIENTS.csv", usecols=["SUBJECT_ID", "GENDER", "DOB"], parse_dates=["DOB"])
    adm = pd.read_csv(d / "ADMISSIONS.csv", usecols=["HADM_ID", "DEATHTIME"], parse_dates=["DEATHTIME"])
    icu = pd.read_csv(d / "ICUSTAYS.csv", usecols=["SUBJECT_ID", "HADM_ID", "ICUSTAY_ID", "FIRST_CAREUNIT", "INTIME", "OUTTIME"], parse_dates=["INTIME", "OUTTIME"])
    s = icu.merge(pat, on="SUBJECT_ID").merge(adm, on="HADM_ID")
    s["age_h"] = (s["INTIME"] - s["DOB"]).dt.total_seconds() / 3600
    s = s[s["age_h"].between(0, 28 * 24, inclusive="left") & (s["FIRST_CAREUNIT"] == "NICU")].copy()
    s["out_h"] = (s["OUTTIME"] - s["INTIME"]).dt.total_seconds() / 3600
    s["death_h"] = (s["DEATHTIME"] - s["INTIME"]).dt.total_seconds() / 3600
    return s


def named_events(df: pd.DataFrame, items: dict[str, list[int]]) -> pd.DataFrame:
    ids = {i: name for name, group in items.items() for i in group}
    df = df[df["ITEMID"].isin(ids)].copy()
    df["feat"] = df["ITEMID"].map(ids)
    return df


def load_events(d: Path, stays: pd.DataFrame) -> pd.DataFrame:
    chart = pd.read_csv(d / "CHARTEVENTS.csv", usecols=["ICUSTAY_ID", "ITEMID", "CHARTTIME", "VALUENUM"], parse_dates=["CHARTTIME"])
    chart = named_events(chart, CHART_ITEMS)
    labs = named_events(pd.read_csv(d / "LABEVENTS.csv", usecols=["HADM_ID", "ITEMID", "CHARTTIME", "VALUENUM"], parse_dates=["CHARTTIME"]), LAB_ITEMS)
    labs = labs.merge(stays[["HADM_ID", "ICUSTAY_ID"]], on="HADM_ID")  # labs carry no stay ID; the hour window below separates stays of one admission
    ev = pd.concat([chart, labs])[["ICUSTAY_ID", "feat", "CHARTTIME", "VALUENUM"]].dropna().merge(stays[["ICUSTAY_ID", "INTIME"]], on="ICUSTAY_ID")
    ev["h"] = (ev["CHARTTIME"] - ev["INTIME"]).dt.total_seconds() / 3600
    hb = ev["feat"] == "hemoglobin"
    ev.loc[hb & (ev["VALUENUM"] < 30), "VALUENUM"] *= 10  # one analyser reports g/dL
    f = ev["feat"] == "fio2"
    ev.loc[f & (ev["VALUENUM"] <= 1), "VALUENUM"] *= 100  # fraction to percent
    lo, hi = ev["feat"].map(lambda k: LIMITS[k][0]), ev["feat"].map(lambda k: LIMITS[k][1])
    return ev[ev["VALUENUM"].between(lo, hi)].sort_values("h")


def first_vasoactive(d: Path, stays: pd.DataFrame) -> pd.Series:
    rx = pd.read_csv(d / "PRESCRIPTIONS.csv", usecols=["HADM_ID", "STARTDATE", "DRUG_NAME_EN", "DRUG_NAME_GENERIC"], parse_dates=["STARTDATE"])
    text = (rx["DRUG_NAME_EN"].fillna("") + " " + rx["DRUG_NAME_GENERIC"].fillna("")).str.lower()
    rx = rx[text.str.contains(VASOACTIVE, regex=True)].merge(stays[["HADM_ID", "ICUSTAY_ID", "INTIME", "out_h"]], on="HADM_ID")
    rx["h"] = (rx["STARTDATE"] - rx["INTIME"]).dt.total_seconds() / 3600
    return rx[rx["h"].between(-24, rx["out_h"])].groupby("ICUSTAY_ID")["h"].min()


def decompensation_hours(ev: pd.DataFrame) -> pd.DataFrame:
    """(stay, hour) of each blood gas meeting a decompensation criterion."""
    g = ev[ev["feat"].isin(["ph", "pco2", "lactate", "fio2"])].pivot_table(index=["ICUSTAY_ID", "h"], columns="feat", values="VALUENUM", aggfunc="last").reset_index()
    bad = ((g["ph"] < 7.25) & (g["pco2"] >= 65)) | (g["ph"] < 7.15) | (g["lactate"] >= 8) | (g["fio2"] >= 60)
    return g.loc[bad, ["ICUSTAY_ID", "h"]]


def at_landmark(ev: pd.DataFrame, stays: pd.DataFrame, vaso: pd.Series, bad: pd.DataFrame, L: int) -> pd.DataFrame:
    s = stays[(stays["out_h"] >= L) & ~(stays["death_h"] < L)].set_index("ICUSTAY_ID")
    before = ev[(ev["h"] < L) & ev["ICUSTAY_ID"].isin(s.index)]
    vitals = before[(before["h"] >= L - VITAL_LOOKBACK) & before["feat"].isin(CHART_ITEMS) & ~before["feat"].isin(["weight_kg", "urine_ml"])]
    labs = before[(before["h"] >= L - LAB_LOOKBACK) & before["feat"].isin(LAB_ITEMS)]
    x = pd.concat([vitals, labs]).groupby(["ICUSTAY_ID", "feat"])["VALUENUM"].last().unstack().reindex(s.index)
    weights = before[before["feat"] == "weight_kg"].groupby("ICUSTAY_ID")["VALUENUM"]
    urine = before[(before["feat"] == "urine_ml") & (before["h"] >= L - 24)].groupby("ICUSTAY_ID")["VALUENUM"].sum().reindex(s.index)

    r = pd.DataFrame(index=s.index)
    r["subject_id"], r["landmark_h"], r["sex"], r["age_hours"] = s["SUBJECT_ID"], L, s["GENDER"].map({"F": "F", "M": "M"}), s["age_h"] + L
    r["birth_weight_g"] = weights.first().reindex(s.index) * 1000
    r["urine_output"] = (urine / weights.last().reindex(s.index) / 24).clip(0, 15)
    r["map_mmhg"] = (x.get("sbp") + 2 * x.get("dbp")) / 3
    for feat in ["temperature", "heart_rate", "resp_rate", "spo2", "fio2", "ph", "pco2", "po2", "hco3", "base_excess", "lactate", "glucose", "hemoglobin", "wbc", "platelets", "crp", "sodium", "potassium", "creatinine", "bilirubin"]:
        r[feat] = x[feat] if feat in x else np.nan
    for empty in ["gestational_age_wk", "apgar_1", "apgar_5", "delivery_mode", "vent_mode"]:
        r[empty] = np.nan

    first = vaso.reindex(s.index)
    died = s["death_h"].between(L, L + 24, inclusive="left")
    new_vaso = first.between(L, L + 24, inclusive="left")
    recent = bad[bad["h"].between(L - 24, L, inclusive="left")]["ICUSTAY_ID"].unique()
    coming = bad[bad["h"].between(L, L + 24, inclusive="left")]["ICUSTAY_ID"].unique()
    decomp = s.index.isin(coming) & ~s.index.isin(recent)
    r["label_strict"] = (died | new_vaso).astype(int)
    r["deteriorated_24h"] = (died | new_vaso | decomp).astype(int)
    return r.reset_index()


def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("--pic-dir", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args(); d, out = Path(a.pic_dir), Path(a.out).resolve()
    repo = Path(__file__).resolve().parents[2]
    if repo in out.parents:
        raise SystemExit(f"--out is inside {repo}: PIC-derived rows must stay out of the repository and the image")
    out.parent.mkdir(parents=True, exist_ok=True)
    stays = nicu_stays(d)
    print(f"[pic] NICU stays of neonates: {len(stays)}, patients {stays['SUBJECT_ID'].nunique()}")
    ev = load_events(d, stays); vaso = first_vasoactive(d, stays); bad = decompensation_hours(ev)
    df = pd.concat([at_landmark(ev, stays, vaso, bad, L) for L in LANDMARKS], ignore_index=True)
    df.insert(0, "admission_id", "PIC-" + df["ICUSTAY_ID"].astype(str) + "-" + df["landmark_h"].astype(str))
    df.drop(columns="ICUSTAY_ID").to_csv(out, index=False)
    prevalence = round(float(df["deteriorated_24h"].mean()), 4)
    manifest = {"file": out.name, "rows": int(len(df)), "patients": int(df["subject_id"].nunique()), "prevalence": prevalence, "prevalence_strict": round(float(df["label_strict"].mean()), 4), "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
                "origin": "PIC v1.1.0", "origin_label": f"PIC v1.1.0 ({df['subject_id'].nunique()} neonates, NICU)", "description": "Built by ml/build_pic_cohort.py from the credentialed PIC tables.", "features": 31, "label": "deteriorated_24h"}
    (out.parent / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[pic] {len(df)} rows · {manifest['patients']} patients · prevalence {prevalence} · strict {manifest['prevalence_strict']} → {out}")


if __name__ == "__main__":
    main()
