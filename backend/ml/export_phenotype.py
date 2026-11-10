"""One-time conversion of the CardioAI phenotype model (StandardScaler -> PCA -> KMeans, 3 clusters) to numeric arrays.

Source: https://github.com/AdeleKunuspekova/CardioAI/tree/d03b5d7be5386ed31ac90e92a06bce9814c18dd6/models/phenotype
The pickles are read once with the restricted unpickler of services.cardioai; runtime (services/cardioai.phenotype)
uses ml/cardioai/phenotype.npz with allow_pickle=False.

    python -m ml.export_phenotype --src ../../cardioai_reference/models/phenotype
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np

from services.cardioai import ROOT, ModelUnpickler

ModelUnpickler.ALLOWED |= {("sklearn.cluster._kmeans", "KMeans"), ("numpy", "int32")}


def load(path: Path):
    with path.open("rb") as f:
        return ModelUnpickler(str(path), f).load()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    src = Path(ap.parse_args().src)
    scaler, pca, km = load(src / "scaler.joblib"), load(src / "pca.joblib"), load(src / "kmeans.joblib")
    assert not pca.whiten
    cols = json.loads((src / "numeric_cols.json").read_text(encoding="utf-8"))
    out = ROOT / "phenotype.npz"
    np.savez_compressed(out, scaler_mean=scaler.mean_, scaler_scale=scaler.scale_, pca_mean=pca.mean_, pca_components=pca.components_,
                        centers=km.cluster_centers_)
    shutil.copy(src / "numeric_cols.json", ROOT / "phenotype_numeric_cols.json")
    shutil.copy(src / "cluster_profiles.json", ROOT / "phenotype_profiles.json")
    # reference: original sklearn predictions for random rows, checked by tests
    rng = np.random.default_rng(0)
    rows = scaler.mean_ + rng.normal(size=(20, len(cols))) * scaler.scale_
    labels = km.predict(pca.transform(scaler.transform(rows))).tolist()
    (ROOT / "phenotype_reference.json").write_text(json.dumps({"rows": rows.tolist(), "labels": labels}))
    manifest = json.loads((ROOT / "manifest.json").read_text())
    manifest["sha256"]["phenotype.npz"] = hashlib.sha256(out.read_bytes()).hexdigest()
    manifest["phenotype"] = {"source": "https://github.com/AdeleKunuspekova/CardioAI/tree/d03b5d7be5386ed31ac90e92a06bce9814c18dd6/models/phenotype",
                             "model": f"StandardScaler + PCA ({pca.n_components_} components) + KMeans ({km.n_clusters} clusters)",
                             "limitations": ["Unsupervised clusters; all three source profiles carry the same label",
                                             "Source profiles list the row-index column 'Unnamed: 0.1' among key features (possible leakage)",
                                             "No pregnancy-specific validation"]}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print("exported", km.n_clusters, "clusters,", pca.n_components_, "components,", len(cols), "features; reference labels", labels)


if __name__ == "__main__":
    main()
