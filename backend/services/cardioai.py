"""Pinned CardioAI hypertension classifier adapter. Research output, not pregnancy diagnosis."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from joblib.numpy_pickle import NumpyUnpickler

ROOT = Path(__file__).resolve().parents[1] / "ml" / "cardioai"
SOURCE = "https://github.com/AdeleKunuspekova/CardioAI/tree/d03b5d7be5386ed31ac90e92a06bce9814c18dd6/models/hypertensia"


class ModelUnpickler(NumpyUnpickler):
    # Never import arbitrary globals from downloaded pickle files.
    ALLOWED = {
        ("sklearn.preprocessing._data", "StandardScaler"), ("sklearn.decomposition._pca", "PCA"),
        ("sklearn.feature_extraction._hash", "FeatureHasher"), ("sklearn.ensemble._forest", "RandomForestClassifier"),
        ("sklearn.tree._classes", "DecisionTreeClassifier"), ("sklearn.tree._tree", "Tree"),
        ("joblib.numpy_pickle", "NumpyArrayWrapper"), ("numpy", "ndarray"), ("numpy", "dtype"),
        ("numpy.core.multiarray", "_reconstruct"), ("numpy.core.multiarray", "scalar"),
        ("numpy._core.multiarray", "_reconstruct"), ("numpy._core.multiarray", "scalar"),
        ("numpy", "float64"), ("numpy", "float32"), ("numpy", "int64"),
        ("builtins", "slice"),
    }

    def find_class(self, module, name):
        if (module, name) not in self.ALLOWED:
            raise ValueError(f"Unsupported model global: {module}.{name}")
        return super().find_class(module, name)


@lru_cache(maxsize=1)
def load_model():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    models = {}
    for name in ("scaler", "pca", "hasher", "rf"):
        path = ROOT / f"{name}.joblib"
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest["sha256"][path.name]:
            raise ValueError("Model checksum mismatch")
        with path.open("rb") as stream:
            models[name] = ModelUnpickler(str(path), stream).load()
    models["numeric"] = json.loads((ROOT / "numeric_cols.json").read_text())
    models["categorical"] = json.loads((ROOT / "categorical_cols.json").read_text())
    models["rf"].n_jobs = 1
    return models


def predict_original(features: dict) -> dict:
    m = load_model()
    missing = [name for name in m["numeric"] if features.get(name) is None]
    row = np.array([[float(features.get(name, m["scaler"].mean_[i])) for i, name in enumerate(m["numeric"])]])
    if not np.isfinite(row).all():
        raise ValueError("Non-finite model input")
    numeric = m["pca"].transform(m["scaler"].transform(row))
    tokens = [[f"{name}={str(features[name]).strip() if features.get(name) is not None else 'unknown'}" for name in m["categorical"]]]
    x = np.hstack([numeric, m["hasher"].transform(tokens).toarray()])
    probabilities = m["rf"].predict_proba(x)[0]
    classes = [int(c) for c in m["rf"].classes_]
    return {"stage": int(m["rf"].predict(x)[0]), "class_shares": [{"stage": c, "share": float(p)} for c, p in zip(classes, probabilities)],
            "numeric_supplied": len(m["numeric"]) - len(missing), "numeric_total": len(m["numeric"]), "imputed_features": missing,
            "source": SOURCE, "experimental": True, "pregnancy_validated": False,
            "class_zero_meaning": "No stage extracted from the original diagnosis text; not proof of normal blood pressure"}


@lru_cache(maxsize=1)
def load_numeric():
    path = ROOT / "model.npz"
    manifest = json.loads((ROOT / "manifest.json").read_text())
    if hashlib.sha256(path.read_bytes()).hexdigest() != manifest["sha256"][path.name]:
        raise ValueError("Model checksum mismatch")
    with np.load(path, allow_pickle=False) as file:
        arrays = {key: file[key] for key in file.files}
    return arrays, json.loads((ROOT / "numeric_cols.json").read_text()), json.loads((ROOT / "categorical_cols.json").read_text())


def predict(features: dict) -> dict:
    from sklearn.feature_extraction import FeatureHasher
    m, numeric, categorical = load_numeric()
    missing = [name for name in numeric if features.get(name) is None]
    row = np.array([[float(features[name]) if features.get(name) is not None else m["scaler_mean"][i] for i, name in enumerate(numeric)]])
    if not np.isfinite(row).all():
        raise ValueError("Non-finite model input")
    scaled = (row - m["scaler_mean"]) / m["scaler_scale"]
    projected = scaled @ m["pca_components"].T - m["pca_mean"] @ m["pca_components"].T
    tokens = [[f"{name}={str(features[name]).strip() if features.get(name) is not None else 'unknown'}" for name in categorical]]
    hashed = FeatureHasher(n_features=int(m["hash_dim"]), alternate_sign=bool(m["alternate_sign"]), input_type="string").transform(tokens).toarray()
    x = np.hstack([projected, hashed])[0].astype(np.float32)
    shares = np.zeros(len(m["classes"]))
    for i in range(int(m["tree_count"])):
        node = 0
        while m[f"t{i}_children_left"][node] != -1:
            feature = int(m[f"t{i}_feature"][node])
            node = int(m[f"t{i}_children_left"][node] if x[feature] <= m[f"t{i}_threshold"][node] else m[f"t{i}_children_right"][node])
        values = m[f"t{i}_value"][node, 0]
        shares += values / values.sum()
    shares /= int(m["tree_count"])
    return {"stage": int(m["classes"][int(np.argmax(shares))]),
            "class_shares": [{"stage": int(c), "share": float(p)} for c, p in zip(m["classes"], shares)],
            "numeric_supplied": len(numeric) - len(missing), "numeric_total": len(numeric), "imputed_features": missing,
            "source": SOURCE, "experimental": True, "pregnancy_validated": False}


# ----------------------------------------------------------------------------------------------- phenotype (KMeans)
PHENOTYPE_SOURCE = "https://github.com/AdeleKunuspekova/CardioAI/tree/d03b5d7be5386ed31ac90e92a06bce9814c18dd6/models/phenotype"
SERVICE_COLS = {"Unnamed: 0.1", "Unnamed: 0", "bp_max", "ppt"}  # row indices and fields absent from most documents
# The source labels all three clusters "Функциональный / аритмический фенотип"; these names describe each centre instead
# (checked in tests/test_examples.py against the centre values).
PHENOTYPE_NAMES = {0: {"ru": "АД выше среднего", "en": "Above-average blood pressure", "kz": "Қысым орташадан жоғары"},
                   1: {"ru": "АД ниже среднего", "en": "Below-average blood pressure", "kz": "Қысым орташадан төмен"},
                   2: {"ru": "Почечный профиль: креатинин ↑, рСКФ ↓, ИМТ ↑", "en": "Renal profile: creatinine ↑, eGFR ↓, BMI ↑", "kz": "Бүйрек профилі: креатинин ↑, ШСЖ ↓, ДМИ ↑"}}


@lru_cache(maxsize=1)
def load_phenotype():
    path = ROOT / "phenotype.npz"
    manifest = json.loads((ROOT / "manifest.json").read_text())
    if hashlib.sha256(path.read_bytes()).hexdigest() != manifest["sha256"]["phenotype.npz"]:
        raise ValueError("Model checksum mismatch")
    with np.load(path, allow_pickle=False) as file:
        m = {key: file[key] for key in file.files}
    cols = json.loads((ROOT / "phenotype_numeric_cols.json").read_text())
    # cluster centres back in feature space, as z-scores of the training population
    m["center_z"] = m["centers"] @ m["pca_components"] + m["pca_mean"]
    return m, cols


def phenotype(features: dict, top: int = 6) -> dict:
    m, cols = load_phenotype()
    missing = [c for c in cols if features.get(c) is None]
    row = np.array([float(features[c]) if features.get(c) is not None else m["scaler_mean"][i] for i, c in enumerate(cols)])
    if not np.isfinite(row).all():
        raise ValueError("Non-finite model input")
    z = (row - m["scaler_mean"]) / m["scaler_scale"]
    p = (z - m["pca_mean"]) @ m["pca_components"].T
    dist = np.sqrt(((m["centers"] - p) ** 2).sum(1))
    cluster = int(np.argmin(dist))
    inv = 1 / np.maximum(dist, 1e-9)
    usable = [i for i, c in enumerate(cols) if c not in SERVICE_COLS]
    clusters = []
    for k, cz in enumerate(m["center_z"]):
        order = sorted(usable, key=lambda i: -abs(cz[i]))[:top]
        clusters.append({"cluster": k, "name": PHENOTYPE_NAMES.get(k), "distance": round(float(dist[k]), 3), "closeness": round(float(inv[k] / inv.sum()), 3),
                         "key_features": [{"name": cols[i], "center_z": round(float(cz[i]), 2), "center_value": round(float(m["scaler_mean"][i] + cz[i] * m["scaler_scale"][i]), 2),
                                           "patient_z": None if cols[i] in missing else round(float(z[i]), 2), "patient_value": features.get(cols[i])} for i in order]})
    return {"cluster": cluster, "clusters": clusters, "numeric_supplied": len(cols) - len(missing), "numeric_total": len(cols),
            "source": PHENOTYPE_SOURCE, "experimental": True, "pregnancy_validated": False}
