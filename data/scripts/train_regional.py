"""Train the regional infant-mortality forecaster: next-year IMR per oblast.

Usage:  data/.venv/Scripts/python -I data/scripts/train_regional.py

Input:  data/processed/kz_oblast_year.parquet   (run build.py first)
Output: data/models/regional_imr/
  model.joblib               winning model + feature list + calibrated interval
  metrics.json               backtest score of every candidate, per year and overall
  backtest_predictions.csv   every out-of-sample prediction from every candidate
  forecast.csv               next-year forecast per oblast with 80% interval
  expected_vs_observed.csv   latest year: observed IMR vs what the model expected a year earlier

Why this design
- ~20 oblasts x ~17 years is a few hundred rows, so the winner is chosen by rolling-origin
  backtesting (train on years < Y, predict Y, for every test year), not assumed.
- Models predict log(IMR[t+1] / IMR[t]), not the level. Trees cannot extrapolate below the
  range they saw, and IMR falls almost every year; predicting the change avoids that.
- Kazakhstan adopted the WHO live-birth definition in 2008 (national IMR 14.6 -> 20.7), so
  nothing before 2008 is used, not even as a lag.
- Training rows are weighted by infants (population aged 0): a small oblast's IMR is mostly
  Poisson noise and should not pull the fit as hard as Almaty's.
"""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor, RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

DATA = Path(__file__).resolve().parent.parent
OUT = DATA / "models" / "regional_imr"
FIRST_COMPARABLE_YEAR = 2008  # WHO live-birth criteria
FIRST_TEST_YEAR = 2016
SEED = 42

FEATURES = [
    "imr", "imr_lag1", "imr_lag2", "imr_mean3", "imr_trend",
    "nat_imr", "imr_rel_nat", "nat_change",
    "tfr", "beds_per_10k", "doctors_per_10k", "log_pop", "pop_growth", "age0_per_1k",
]


def make_frame(panel: pd.DataFrame) -> pd.DataFrame:
    """One row per oblast x year t, features known at the end of t, target = IMR at t+1."""
    nat = panel[panel.oblast_code == "00"].set_index("year").infant_mortality_rate
    p = panel[~panel.oblast_code.isin(["00", "51"])].sort_values(["oblast_code", "year"]).copy()
    p.loc[p.year < FIRST_COMPARABLE_YEAR, "infant_mortality_rate"] = np.nan
    g = p.groupby("oblast_code")

    f = p[["oblast_code", "oblast_name", "year"]].copy()
    f["imr"] = p.infant_mortality_rate
    f["imr_lag1"] = g.infant_mortality_rate.shift(1)
    f["imr_lag2"] = g.infant_mortality_rate.shift(2)
    f["imr_mean3"] = f[["imr", "imr_lag1", "imr_lag2"]].mean(axis=1, skipna=False)
    f["imr_trend"] = (f.imr - f.imr_lag2) / 2
    f["nat_imr"] = f.year.map(nat)
    f["imr_rel_nat"] = f.imr / f.nat_imr
    f["nat_change"] = np.log(f.nat_imr / f.year.map(nat.shift(1)))
    f["tfr"] = p.total_fertility_rate
    f["beds_per_10k"] = p.beds_per_10k
    f["doctors_per_10k"] = p.doctors_per_10k
    f["log_pop"] = np.log(p.population)
    f["pop_growth"] = g.population.pct_change(fill_method=None)
    f["age0_per_1k"] = p.population_age0 / p.population * 1000
    f["weight"] = p.population_age0.fillna(p.population_age0.median())

    f["target_year"] = f.year + 1
    f["imr_next"] = g.infant_mortality_rate.shift(-1)
    f["y"] = np.log(f.imr_next / f.imr)
    # lags come from the same series, so this also enforces "no pre-2008 data anywhere"
    return f[f.imr.notna() & f.imr_lag2.notna()].reset_index(drop=True)


# --- candidates -------------------------------------------------------------------------
# Each returns predicted IMR[t+1] (level). Hyperparameters are fixed and conservative on
# purpose: tuning them on a few hundred rows would just overfit the backtest.

class Persistence:
    name = "persistence"
    def fit(self, X, y, w): return self
    def predict(self, X): return X.imr.to_numpy()


class Mean3:
    name = "mean_3y"
    def fit(self, X, y, w): return self
    def predict(self, X): return X.imr_mean3.to_numpy()


class ChangeModel:
    """Fits an sklearn-style regressor to log(IMR[t+1]/IMR[t]) and converts back to a level."""
    def __init__(self, name, est):
        self.name, self.est = name, est

    def fit(self, X, y, w):
        last = self.est.steps[-1][0] if hasattr(self.est, "steps") else None
        kw = {f"{last}__sample_weight": w} if last else {"sample_weight": w}
        self.est.fit(X[FEATURES], y, **kw)
        return self

    def predict(self, X):
        return X.imr.to_numpy() * np.exp(self.est.predict(X[FEATURES]))


class PoissonLevel:
    """Poisson GLM on the IMR level (log link) - the classical model for a rate."""
    name = "poisson_glm"
    def __init__(self):
        self.est = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                                 PoissonRegressor(alpha=1e-3, max_iter=2000))

    def fit(self, X, y, w):
        self.est.fit(X[FEATURES], X.imr * np.exp(y), poissonregressor__sample_weight=w)
        return self

    def predict(self, X): return self.est.predict(X[FEATURES])


class Blend:
    def __init__(self, name, parts):
        self.name, self.parts = name, parts
    def fit(self, X, y, w):
        for m in self.parts:
            m.fit(X, y, w)
        return self
    def predict(self, X): return np.mean([m.predict(X) for m in self.parts], axis=0)


def ridge():
    return ChangeModel("ridge", make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                                              RidgeCV(alphas=np.logspace(-2, 3, 30))))


def xgb():
    return ChangeModel("xgboost", XGBRegressor(
        n_estimators=300, learning_rate=0.03, max_depth=2, min_child_weight=5, subsample=0.8,
        colsample_bytree=0.8, reg_lambda=5.0, random_state=SEED, n_jobs=1))


def candidates():
    return [
        Persistence(),
        Mean3(),
        ridge(),
        PoissonLevel(),
        ChangeModel("random_forest", make_pipeline(
            SimpleImputer(strategy="median"),
            RandomForestRegressor(n_estimators=500, min_samples_leaf=5, max_features=0.5,
                                  random_state=SEED, n_jobs=-1))),
        ChangeModel("hist_gbm", HistGradientBoostingRegressor(
            max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=10,
            l2_regularization=1.0, random_state=SEED)),
        xgb(),
        Blend("ridge+xgboost", [ridge(), xgb()]),
    ]


# --- evaluation --------------------------------------------------------------------------

def scores(df: pd.DataFrame) -> dict:
    err = df.pred - df.imr_next
    return {"mae": float(err.abs().mean()),
            "rmse": float(np.sqrt((err ** 2).mean())),
            "weighted_mae": float(np.average(err.abs(), weights=df.weight)),
            "n": int(len(df))}


def backtest(frame: pd.DataFrame) -> pd.DataFrame:
    labelled = frame[frame.imr_next.notna()]
    rows = []
    for test_year in range(FIRST_TEST_YEAR, int(labelled.target_year.max()) + 1):
        train = labelled[labelled.target_year < test_year]
        test = labelled[labelled.target_year == test_year]
        for m in candidates():
            m.fit(train, train.y, train.weight)
            rows.append(test[["oblast_code", "oblast_name", "year", "target_year", "imr",
                              "imr_next", "weight"]].assign(model=m.name, pred=m.predict(test)))
    return pd.concat(rows, ignore_index=True)


def main() -> int:
    panel = pd.read_parquet(DATA / "processed" / "kz_oblast_year.parquet")
    frame = make_frame(panel)
    labelled = frame[frame.imr_next.notna()]
    print(f"samples: {len(labelled)} labelled rows, {labelled.oblast_code.nunique()} oblasts, "
          f"target years {labelled.target_year.min()}-{labelled.target_year.max()}")

    bt = backtest(frame)
    overall = {m: scores(d) for m, d in bt.groupby("model")}
    per_year = {m: {int(y): round(scores(dy)["mae"], 3) for y, dy in d.groupby("target_year")}
                for m, d in bt.groupby("model")}
    base = overall["persistence"]["mae"]
    for s in overall.values():
        s["skill_vs_persistence"] = 1 - s["mae"] / base
    ranking = sorted(overall, key=lambda m: overall[m]["mae"])
    best = ranking[0]

    print(f"\nrolling-origin backtest, test years {FIRST_TEST_YEAR}-{int(bt.target_year.max())}"
          " (IMR per 1,000 live births)")
    print(f"{'model':<16}{'MAE':>7}{'RMSE':>7}{'wMAE':>7}{'skill':>8}")
    for m in ranking:
        s = overall[m]
        print(f"{m:<16}{s['mae']:7.3f}{s['rmse']:7.3f}{s['weighted_mae']:7.3f}"
              f"{s['skill_vs_persistence']:8.1%}")
    print(f"\nselected: {best}")

    # 80% interval from the winner's own out-of-sample errors (split-conformal on log ratio)
    b = bt[bt.model == best]
    log_err = np.log(b.imr_next / b.pred)
    q_lo, q_hi = float(log_err.quantile(0.10)), float(log_err.quantile(0.90))
    coverage = float(((log_err >= q_lo) & (log_err <= q_hi)).mean())

    # Refit the winner on every labelled row and forecast the next year.
    model = next(m for m in candidates() if m.name == best)
    model.fit(labelled, labelled.y, labelled.weight)
    latest = frame[frame.year == frame.year.max()].copy()
    latest["forecast"] = model.predict(latest)
    latest["lo80"] = latest.forecast * np.exp(q_lo)
    latest["hi80"] = latest.forecast * np.exp(q_hi)
    forecast = latest[["oblast_code", "oblast_name", "year", "imr", "forecast", "lo80", "hi80"]] \
        .rename(columns={"year": "last_observed_year", "imr": "last_observed_imr"})
    forecast.insert(3, "forecast_year", forecast.last_observed_year + 1)

    # Which oblasts did worse/better last year than the model expected a year earlier?
    last = b[b.target_year == b.target_year.max()].copy()
    last["lo80"], last["hi80"] = last.pred * np.exp(q_lo), last.pred * np.exp(q_hi)
    last["excess_imr"] = last.imr_next - last.pred
    last["excess_deaths_est"] = last.excess_imr * last.weight / 1000
    last["status"] = np.select([last.imr_next > last.hi80, last.imr_next < last.lo80],
                               ["above expected", "below expected"], "as expected")
    eo = last[["oblast_code", "oblast_name", "target_year", "imr_next", "pred", "lo80", "hi80",
               "excess_imr", "excess_deaths_est", "status"]] \
        .rename(columns={"target_year": "year", "imr_next": "observed_imr", "pred": "expected_imr"})

    OUT.mkdir(parents=True, exist_ok=True)
    importance = None
    est = getattr(model, "est", None)
    final = est.steps[-1][1] if hasattr(est, "steps") else est
    if hasattr(final, "feature_importances_"):
        importance = dict(zip(FEATURES, map(float, final.feature_importances_)))
    elif hasattr(final, "coef_"):
        importance = dict(zip(FEATURES, map(float, np.ravel(final.coef_))))

    joblib.dump({"model": model, "name": best, "features": FEATURES, "target": "log(IMR[t+1]/IMR[t])",
                 "interval_log_q": [q_lo, q_hi], "trained_through": int(labelled.target_year.max()),
                 "make_frame": "data/scripts/train_regional.py:make_frame"}, OUT / "model.joblib")
    bt.to_csv(OUT / "backtest_predictions.csv", index=False, encoding="utf-8")
    forecast.round(3).to_csv(OUT / "forecast.csv", index=False, encoding="utf-8")
    eo.round(3).to_csv(OUT / "expected_vs_observed.csv", index=False, encoding="utf-8")
    (OUT / "metrics.json").write_text(json.dumps({
        "task": "next-year infant mortality rate per oblast (per 1,000 live births)",
        "selected_model": best, "ranking": ranking, "overall": overall, "mae_by_test_year": per_year,
        "interval80": {"log_quantiles": [q_lo, q_hi], "backtest_coverage": coverage},
        "training_rows": int(len(labelled)), "features": FEATURES,
        "importance_or_coef": importance,
        "notes": ["IMR before 2008 excluded (WHO live-birth definition change)",
                  "latest source year may be preliminary"],
    }, indent=2), encoding="utf-8")

    print(f"\n80% interval: x{np.exp(q_lo):.2f} .. x{np.exp(q_hi):.2f} of the point forecast")
    print(f"\nforecast {int(forecast.forecast_year.iloc[0])}:")
    print(forecast.sort_values("forecast", ascending=False).round(2).to_string(index=False))
    print(f"\n{int(eo.year.iloc[0])} observed vs expected:")
    print(eo[eo.status != "as expected"].round(2).to_string(index=False) or "  all within interval")
    print(f"\nsaved to {OUT.relative_to(DATA)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
