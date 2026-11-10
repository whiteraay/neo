"""One-time conversion with sklearn 1.7.1; runtime consumes safe numeric NPZ, not pickle."""
import json
import numpy as np
from services.cardioai import ROOT, load_model, predict_original as predict

m = load_model()
arrays = {"scaler_mean": m["scaler"].mean_, "scaler_scale": m["scaler"].scale_,
          "pca_mean": m["pca"].mean_, "pca_components": m["pca"].components_,
          "classes": m["rf"].classes_, "tree_count": np.array(len(m["rf"].estimators_)),
          "hash_dim": np.array(m["hasher"].n_features), "alternate_sign": np.array(m["hasher"].alternate_sign)}
assert not m["pca"].whiten, "Whitened PCA requires a different export"
for i, estimator in enumerate(m["rf"].estimators_):
    tree = estimator.tree_
    for key in ("children_left", "children_right", "feature", "threshold", "value"):
        arrays[f"t{i}_{key}"] = getattr(tree, key)
np.savez_compressed(ROOT / "model.npz", **arrays)
samples = [{"age": 29, "bp_arm_dex_upper": s, "bp_arm_dex_lower": d} for s, d in [(118, 76), (142, 92), (168, 112)]]
(ROOT / "reference_predictions.json").write_text(json.dumps([{"features": row, "prediction": predict(row)} for row in samples], indent=2))
print("Exported", len(m["rf"].estimators_), "trees", m["rf"].classes_)
