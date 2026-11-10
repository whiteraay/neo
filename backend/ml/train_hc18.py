"""HC18 — fetal head circumference from 2D ultrasound (van den Heuvel et al., PLoS ONE 2018; data CC BY 4.0,
https://zenodo.org/records/1327317).

Small U-Net segments the head, an ellipse is fitted to the largest region, and its perimeter (Ramanujan) times the
pixel size gives HC in mm. Validation is split by subject id (the "010" of "010_2HC.png"), so repeat images of one
fetus never sit on both sides. The model is exported to ONNX and runs in the backend through OpenCV DNN (no torch).

    python -m ml.train_hc18 --data ../data/raw/hc18 --out ml/hc18 --epochs 60
"""
import argparse
import json
import math
import random
import re
from pathlib import Path

import cv2
import numpy as np

H, W = 256, 384  # keeps the 540x800 aspect


def subject(name: str) -> str:
    return re.match(r"(\d+)", name).group(1)


def load_train(root: Path):
    import csv
    rows = list(csv.DictReader(open(root / "training_set_pixel_size_and_HC.csv")))
    items = []
    for r in rows:
        img = cv2.imread(str(root / "training_set" / r["filename"]), cv2.IMREAD_GRAYSCALE)
        ann = cv2.imread(str(root / "training_set" / r["filename"].replace(".png", "_Annotation.png")), cv2.IMREAD_GRAYSCALE)
        mask = np.zeros_like(ann)
        cnts, _ = cv2.findContours((ann > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(mask, cnts, -1, 255, thickness=cv2.FILLED)
        items.append(dict(name=r["filename"], img=img, mask=mask, px=float(r["pixel size(mm)"]), hc=float(r["head circumference (mm)"])))
    return items


def ellipse_hc(prob: np.ndarray, shape: tuple[int, int]):
    """prob (H,W) in [0,1] -> (ellipse in original pixels, perimeter px) or None."""
    m = cv2.resize((prob > 0.5).astype(np.uint8), (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if len(c) < 5:
        return None
    (cx, cy), (d1, d2), ang = cv2.fitEllipse(c)
    a, b = d1 / 2, d2 / 2
    perim = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))
    return ((cx, cy), (d1, d2), ang), perim


def build_model(base=16):
    import torch.nn as nn

    def block(i, o):
        return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                             nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(inplace=True))

    class UNet(nn.Module):
        def __init__(self):
            super().__init__()
            c = [base, base * 2, base * 4, base * 8, base * 16]
            self.d = nn.ModuleList([block(1, c[0]), block(c[0], c[1]), block(c[1], c[2]), block(c[2], c[3]), block(c[3], c[4])])
            self.up = nn.ModuleList([nn.ConvTranspose2d(c[i + 1], c[i], 2, stride=2) for i in range(4)])
            self.u = nn.ModuleList([block(c[i] * 2, c[i]) for i in range(4)])
            self.pool = nn.MaxPool2d(2)
            self.head = nn.Conv2d(c[0], 1, 1)

        def forward(self, x):
            import torch
            skips = []
            for i, blk in enumerate(self.d):
                x = blk(x)
                if i < 4:
                    skips.append(x)
                    x = self.pool(x)
            for i in reversed(range(4)):
                x = self.up[i](x)
                x = self.u[i](torch.cat([x, skips[i]], 1))
            return self.head(x)

    return UNet()


def augment(img, mask):
    if random.random() < 0.5:
        img, mask = img[:, ::-1], mask[:, ::-1]
    if random.random() < 0.5:
        img, mask = img[::-1], mask[::-1]
    ang = random.uniform(-25, 25)
    sc = random.uniform(0.85, 1.15)
    M = cv2.getRotationMatrix2D((W / 2 + random.uniform(-20, 20), H / 2 + random.uniform(-15, 15)), ang, sc)
    img = cv2.warpAffine(np.ascontiguousarray(img), M, (W, H), borderMode=cv2.BORDER_CONSTANT)
    mask = cv2.warpAffine(np.ascontiguousarray(mask), M, (W, H), flags=cv2.INTER_NEAREST)
    img = np.clip(img * random.uniform(0.8, 1.2) + random.uniform(-0.1, 0.1), 0, 1)
    return img.astype(np.float32), mask.astype(np.float32)


def prep(img):
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def main():
    import torch
    import torch.nn.functional as F
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--base", type=int, default=24)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--export-only", action="store_true", help="skip training; evaluate and export ml/hc18/hc18_unet.pt")
    args = ap.parse_args()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    root, out = Path(args.data), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    items = load_train(root)
    subjects = sorted({subject(i["name"]) for i in items})
    random.Random(args.seed).shuffle(subjects)
    val_s = set(subjects[: len(subjects) // 10])
    tr = [i for i in items if subject(i["name"]) not in val_s]
    va = [i for i in items if subject(i["name"]) in val_s]
    print(f"train {len(tr)} images, val {len(va)} images ({len(val_s)} subjects)", flush=True)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    # all training images live on the device; augmentation is one affine_grid/grid_sample per batch
    X = torch.from_numpy(np.stack([prep(i["img"]) for i in tr]))[:, None].to(dev)
    Y = torch.from_numpy(np.stack([cv2.resize(i["mask"], (W, H), interpolation=cv2.INTER_NEAREST) / 255.0 for i in tr]).astype(np.float32))[:, None].to(dev)
    model = build_model(args.base).to(dev)
    steps = args.epochs * math.ceil(len(X) / args.batch)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.15)

    def gpu_augment(x, y):
        n = x.shape[0]
        ang = (torch.rand(n, device=dev) * 2 - 1) * math.radians(25)
        sc = 1 / (0.85 + torch.rand(n, device=dev) * 0.3)
        fx = torch.where(torch.rand(n, device=dev) < 0.5, -1.0, 1.0)
        fy = torch.where(torch.rand(n, device=dev) < 0.5, -1.0, 1.0)
        theta = torch.zeros(n, 2, 3, device=dev)
        theta[:, 0, 0] = torch.cos(ang) * sc; theta[:, 0, 1] = -torch.sin(ang) * sc * (H / W)
        theta[:, 1, 0] = torch.sin(ang) * sc * (W / H); theta[:, 1, 1] = torch.cos(ang) * sc
        theta[:, 0, :2] *= fx[:, None]; theta[:, 1, :2] *= fy[:, None]  # mirror whole rows: a true reflection
        theta[:, :, 2] = (torch.rand(n, 2, device=dev) * 2 - 1) * 0.08
        grid = F.affine_grid(theta, x.shape, align_corners=False)
        x = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
        y = (F.grid_sample(y, grid, mode="bilinear", padding_mode="zeros", align_corners=False) > 0.5).float()
        gamma = torch.exp((torch.rand(n, 1, 1, 1, device=dev) * 2 - 1) * 0.3)
        x = (x.clamp(0, 1) ** gamma) * (0.85 + torch.rand(n, 1, 1, 1, device=dev) * 0.3)
        return x.clamp(0, 1), y

    def evaluate():
        model.eval()
        errs, dices = [], []
        with torch.no_grad():
            for i in va:
                x = torch.from_numpy(prep(i["img"]))[None, None].to(dev)
                p = ((torch.sigmoid(model(x)) + torch.sigmoid(model(x.flip(3))).flip(3)) / 2)[0, 0].cpu().numpy()
                gt = cv2.resize(i["mask"], (W, H), interpolation=cv2.INTER_NEAREST) > 127
                pr = p > 0.5
                dices.append(2 * (pr & gt).sum() / max(1, pr.sum() + gt.sum()))
                e = ellipse_hc(p, i["img"].shape)
                errs.append(abs(e[1] * i["px"] - i["hc"]) if e else i["hc"])
        model.train()
        return float(np.mean(errs)), float(np.median(errs)), float(np.mean(dices)), errs

    import time
    t0 = time.time()
    best = (1e9, None)
    if args.export_only:  # finish from the saved best checkpoint (e.g. after an interrupted run)
        best = (0, torch.load(out / "hc18_unet.pt", map_location=dev, weights_only=True))
    for ep in range(0 if args.export_only else args.epochs):
        perm = torch.randperm(len(X), device=dev)
        tot = 0.0
        for b in range(0, len(X), args.batch):
            idx = perm[b:b + args.batch]
            x, y = gpu_augment(X[idx], Y[idx])
            logits = model(x)
            p = torch.sigmoid(logits)
            dice = 1 - (2 * (p * y).sum((2, 3)) + 1) / (p.sum((2, 3)) + y.sum((2, 3)) + 1)
            loss = F.binary_cross_entropy_with_logits(logits, y) + dice.mean()
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tot += loss.item() * len(idx)
        if ep % 10 == 9 or ep == args.epochs - 1:
            mae, med, dsc, _ = evaluate()
            print(f"epoch {ep + 1}: loss {tot / len(X):.4f}  val HC MAE {mae:.2f} mm (median {med:.2f})  Dice {dsc:.4f}  [{time.time() - t0:.0f}s]", flush=True)
            if mae < best[0]:
                best = (mae, {k: v.detach().clone() for k, v in model.state_dict().items()})
                torch.save(best[1], out / "hc18_unet.pt")
    model.load_state_dict(best[1])
    mae, med, dsc, errs = evaluate()
    model.eval().cpu()
    torch.onnx.export(model, torch.zeros(1, 1, H, W), str(out / "hc18_unet.onnx"), input_names=["image"], output_names=["logits"], opset_version=11)

    # test set: labels are not public; store the predicted HC for each image
    import csv
    test_rows = list(csv.DictReader(open(root / "test_set_pixel_size.csv")))
    preds = []
    with torch.no_grad():
        for r in test_rows:
            img = cv2.imread(str(root / "test_set" / r["filename"]), cv2.IMREAD_GRAYSCALE)
            x = torch.from_numpy(prep(img))[None, None]
            p = ((torch.sigmoid(model(x)) + torch.sigmoid(model(x.flip(3))).flip(3)) / 2)[0, 0].numpy()
            e = ellipse_hc(p, img.shape)
            px = float(r["pixel size(mm)"])
            preds.append({"filename": r["filename"], "pixel_size_mm": px, "hc_mm": round(e[1] * px, 2) if e else None})
    with open(out / "test_set_predictions.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["filename", "pixel_size_mm", "hc_mm"]); w.writeheader(); w.writerows(preds)
    hc_train = [i["hc"] for i in items]
    meta = {"source": "HC18 Grand Challenge, van den Heuvel et al. 2018, https://zenodo.org/records/1327317 (CC BY 4.0)",
            "model": f"U-Net (base {args.base}, {sum(p.numel() for p in model.parameters())} parameters), input {H}x{W} grayscale, BCE + Dice, {args.epochs} epochs, GPU affine/gamma augmentation, flip TTA",
            "split": "validation = 10 % of subjects (by id), never seen in training",
            "n_train": len(tr), "n_val": len(va), "n_test": len(test_rows),
            "val_hc_mae_mm": round(mae, 2), "val_hc_median_ae_mm": round(med, 2), "val_dice": round(dsc, 4),
            "val_within_3mm": round(float(np.mean(np.array(errs) <= 3)), 3),
            "train_hc_mm": {"min": min(hc_train), "median": float(np.median(hc_train)), "max": max(hc_train)},
            "test_predicted": sum(p["hc_mm"] is not None for p in preds),
            "test_hc_mm": {"min": min(p["hc_mm"] for p in preds if p["hc_mm"]), "median": float(np.median([p["hc_mm"] for p in preds if p["hc_mm"]])),
                           "max": max(p["hc_mm"] for p in preds if p["hc_mm"])},
            "input": {"height": H, "width": W, "scale": "1/255"}}
    (out / "hc18_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
