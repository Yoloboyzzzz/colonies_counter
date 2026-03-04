"""
train_model.py  —  Retrain / fine-tune the colony detection model.

Usage (from the backend/ folder with venv active):

    python train_model.py                     # 100 epochs, start fresh
    python train_model.py --epochs 200        # custom epoch count
    python train_model.py --resume            # continue from last checkpoint
    python train_model.py --finetune          # fine-tune existing best.pt
    python train_model.py --epochs 50 --imgsz 1280  # larger images
"""

import argparse
import shutil
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
DATA_DIR    = BASE_DIR / "data"
DATASET_YAML= DATA_DIR / "dataset.yaml"
MODELS_DIR  = DATA_DIR / "models"
BEST_PT     = MODELS_DIR / "best.pt"
RUNS_DIR    = MODELS_DIR / "runs"

MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Train YOLOv8 colony detector")
parser.add_argument("--epochs",   type=int,   default=100,  help="Number of training epochs")
parser.add_argument("--imgsz",    type=int,   default=640,  help="Input image size (pixels)")
parser.add_argument("--batch",    type=int,   default=2,    help="Batch size (keep low for CPU)")
parser.add_argument("--patience", type=int,   default=30,   help="Early-stop patience epochs")
parser.add_argument("--resume",   action="store_true",      help="Resume from last checkpoint")
parser.add_argument("--finetune", action="store_true",      help="Fine-tune existing best.pt instead of yolov8n.pt")
parser.add_argument("--device",   type=str,   default="",   help="Device: '' = auto, 'cpu', '0' = GPU 0")
args = parser.parse_args()

# ── Sanity checks ─────────────────────────────────────────────────────────────
images = list((DATA_DIR / "train" / "images").glob("*.jpg"))
labels = list((DATA_DIR / "train" / "labels").glob("*.txt"))
print(f"Training images : {len(images)}")
print(f"Label files     : {len(labels)}")
if len(images) < 2:
    raise SystemExit("Need at least 2 training images. Add more via the Train tab.")

# ── Choose base model ─────────────────────────────────────────────────────────
if args.resume:
    last_pt = RUNS_DIR / "weights" / "last.pt"
    if not last_pt.exists():
        raise SystemExit(f"No last checkpoint found at {last_pt}. Run without --resume first.")
    base_model = str(last_pt)
    print(f"Resuming from   : {base_model}")
elif args.finetune and BEST_PT.exists():
    base_model = str(BEST_PT)
    print(f"Fine-tuning from: {base_model}")
else:
    base_model = "yolov8n.pt"
    print(f"Starting from   : {base_model} (pretrained COCO)")

# ── Train ─────────────────────────────────────────────────────────────────────
from ultralytics import YOLO

model = YOLO(base_model)

print(f"\nStarting training: {args.epochs} epochs, imgsz={args.imgsz}, batch={args.batch}")
print("-" * 60)

results = model.train(
    data=str(DATASET_YAML),
    epochs=args.epochs,
    imgsz=args.imgsz,
    batch=args.batch,
    patience=args.patience,
    device=args.device if args.device else None,
    project=str(MODELS_DIR),
    name="runs",
    exist_ok=True,
    resume=args.resume,
)

# ── Save best model to canonical location ─────────────────────────────────────
print("\nLooking for best.pt …")
candidates = sorted(MODELS_DIR.rglob("best.pt"), key=lambda p: p.stat().st_mtime)

if candidates:
    src = candidates[-1]
    shutil.copy(src, BEST_PT)
    size_mb = BEST_PT.stat().st_size / 1024 / 1024
    print(f"✓ Model saved  : {BEST_PT}  ({size_mb:.1f} MB)")
    print(f"  Source       : {src}")
else:
    print("⚠  best.pt not found — check the runs/ folder manually.")

# ── Print final metrics ───────────────────────────────────────────────────────
try:
    import csv
    csv_files = sorted(MODELS_DIR.rglob("results.csv"), key=lambda p: p.stat().st_mtime)
    if csv_files:
        with open(csv_files[-1]) as f:
            rows = list(csv.DictReader(f))
        if rows:
            last = rows[-1]
            print("\nFinal epoch metrics:")
            print(f"  mAP50        : {float(last.get('metrics/mAP50(B)', 0)):.4f}")
            print(f"  mAP50-95     : {float(last.get('metrics/mAP50-95(B)', 0)):.4f}")
            print(f"  Precision    : {float(last.get('metrics/precision(B)', 0)):.4f}")
            print(f"  Recall       : {float(last.get('metrics/recall(B)', 0)):.4f}")
except Exception:
    pass

print("\nDone. Restart the backend to use the updated model.")
