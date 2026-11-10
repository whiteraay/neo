"""Fetal head circumference (HC) from a 2D ultrasound image — U-Net trained on HC18 (ml/train_hc18.py).

Runs the exported ONNX model with OpenCV DNN (no torch in the image), fits an ellipse to the largest segmented region and
reports its perimeter (Ramanujan). With the pixel size the perimeter becomes HC in mm, and Hadlock (1982) gives an
estimated gestational age: GA (weeks) = 8.96 + 0.540·HC + 0.0003·HC³ (HC in cm). Research aid, not a measurement of record.
"""
from __future__ import annotations

import base64
import json
import math
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "ml" / "hc18"
SAMPLES = Path(__file__).resolve().parents[1] / "data" / "hc18_samples"


class HCError(ValueError):
    pass


@lru_cache(maxsize=1)
def load():
    path = ROOT / "hc18_unet.onnx"
    if not path.exists():
        raise HCError("model_missing")
    meta = json.loads((ROOT / "hc18_meta.json").read_text(encoding="utf-8"))
    return cv2.dnn.readNetFromONNX(str(path)), meta


def info() -> dict:
    try:
        _, meta = load()
        return {"ready": True, **meta}
    except HCError:
        return {"ready": False}


def samples() -> list[dict]:
    path = SAMPLES / "samples.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def hadlock_ga_weeks(hc_mm: float) -> float | None:
    hc = hc_mm / 10
    if not 5 <= hc <= 38:  # outside the range the formula was fitted on
        return None
    return round(8.96 + 0.540 * hc + 0.0003 * hc ** 3, 1)


def measure(data: bytes, pixel_size_mm: float | None) -> dict:
    net, meta = load()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
    if img is None or img.size == 0:
        raise HCError("not_image")
    if max(img.shape) > 4000:
        raise HCError("too_large")
    h, w = meta["input"]["height"], meta["input"]["width"]
    x = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    prob = np.zeros((h, w), np.float32)
    for flip in (False, True):  # horizontal-flip test-time augmentation, as in training validation
        net.setInput((x[:, ::-1] if flip else x).copy()[None, None])
        p = 1 / (1 + np.exp(-net.forward()[0, 0]))
        prob += (p[:, ::-1] if flip else p) / 2
    mask = cv2.resize((prob > 0.5).astype(np.uint8), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts or len(max(cnts, key=cv2.contourArea)) < 5:
        raise HCError("no_head")
    c = max(cnts, key=cv2.contourArea)
    (cx, cy), (d1, d2), ang = cv2.fitEllipse(c)
    a, b = d1 / 2, d2 / 2
    perim = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))
    confidence = float(prob[prob > 0.5].mean()) if (prob > 0.5).any() else 0.0
    overlay = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    cv2.ellipse(overlay, ((cx, cy), (d1, d2), ang), (155, 159, 14), max(2, img.shape[1] // 300))  # #0E9F9B in BGR
    ok, png = cv2.imencode(".png", overlay)
    out = {"hc_px": round(perim, 1), "ellipse": {"cx": round(cx, 1), "cy": round(cy, 1), "major_px": round(max(d1, d2), 1), "minor_px": round(min(d1, d2), 1), "angle": round(ang, 1)},
           "confidence": round(confidence, 3), "overlay_png": base64.b64encode(png.tobytes()).decode() if ok else None,
           "hc_mm": None, "ga_weeks": None, "pixel_size_mm": pixel_size_mm, "model": {k: meta[k] for k in ("source", "val_hc_mae_mm", "val_dice") if k in meta}}
    if pixel_size_mm:
        out["hc_mm"] = round(perim * pixel_size_mm, 1)
        out["ga_weeks"] = hadlock_ga_weeks(out["hc_mm"])
    return out
