import os
import json
import shutil
import base64
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import yaml
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
import io

app = FastAPI(title="Colony Counter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
IMAGES_DIR = DATA_DIR / "train" / "images"
LABELS_DIR = DATA_DIR / "train" / "labels"
MODELS_DIR = DATA_DIR / "models"
DATASET_YAML = DATA_DIR / "dataset.yaml"

for d in [IMAGES_DIR, LABELS_DIR, MODELS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODELS_DIR / "best.pt"
BASE_MODEL = "yolov8n.pt"  # nano model as starting point


def get_model():
    from ultralytics import YOLO
    if MODEL_PATH.exists():
        return YOLO(str(MODEL_PATH))
    return YOLO(BASE_MODEL)


def apply_image_adjustments(image_bytes: bytes, brightness: float, contrast: float) -> bytes:
    """Apply brightness and contrast adjustments to image."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # brightness: -100 to 100 (0 = no change)
    # contrast: 0.5 to 3.0 (1.0 = no change)
    adjusted = cv2.convertScaleAbs(img, alpha=contrast, beta=brightness)

    _, buffer = cv2.imencode('.jpg', adjusted, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return buffer.tobytes()


def image_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode('utf-8')


@app.get("/")
def root():
    return {"status": "ok", "model": "loaded" if MODEL_PATH.exists() else "using_pretrained"}


@app.post("/detect")
async def detect_colonies(
    file: UploadFile = File(...),
    brightness: float = Form(0.0),
    contrast: float = Form(1.0),
    confidence: float = Form(0.25),
):
    """Detect colonies in uploaded petri dish image."""
    image_bytes = await file.read()

    # Apply adjustments
    adjusted_bytes = apply_image_adjustments(image_bytes, brightness, contrast)

    # Save to temp file for YOLO
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        tmp.write(adjusted_bytes)
        tmp_path = tmp.name

    try:
        model = get_model()
        results = model(tmp_path, conf=confidence, verbose=False)
        result = results[0]

        detections = []
        if result.boxes is not None and len(result.boxes) > 0:
            boxes = result.boxes
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                conf = float(boxes.conf[i])
                cls = int(boxes.cls[i])
                class_name = model.names.get(cls, f"class_{cls}")
                detections.append({
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "confidence": round(conf, 3),
                    "class": class_name,
                    "class_id": cls,
                })

        # Return adjusted image as base64
        adjusted_b64 = image_to_base64(adjusted_bytes)

        # Draw boxes on image
        nparr = np.frombuffer(adjusted_bytes, np.uint8)
        annotated = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        for det in detections:
            x1, y1, x2, y2 = int(det['x1']), int(det['y1']), int(det['x2']), int(det['y2'])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"{det['class']} {det['confidence']:.2f}"
            cv2.putText(annotated, label, (x1, max(y1 - 5, 0)),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        _, ann_buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 95])
        annotated_b64 = image_to_base64(ann_buf.tobytes())

        img_h, img_w = annotated.shape[:2]

        return JSONResponse({
            "count": len(detections),
            "detections": detections,
            "adjusted_image": adjusted_b64,
            "annotated_image": annotated_b64,
            "image_width": img_w,
            "image_height": img_h,
        })
    finally:
        os.unlink(tmp_path)


@app.post("/adjust")
async def adjust_image(
    file: UploadFile = File(...),
    brightness: float = Form(0.0),
    contrast: float = Form(1.0),
):
    """Return brightness/contrast adjusted image without detection."""
    image_bytes = await file.read()
    adjusted_bytes = apply_image_adjustments(image_bytes, brightness, contrast)
    adjusted_b64 = image_to_base64(adjusted_bytes)
    return JSONResponse({"adjusted_image": adjusted_b64})


@app.post("/training/upload")
async def upload_training_image(
    file: UploadFile = File(...),
    annotations: str = Form("[]"),
):
    """Upload a training image with colony annotations (YOLO format bboxes)."""
    image_bytes = await file.read()

    # Generate unique filename
    stem = Path(file.filename).stem if file.filename else "image"
    existing = list(IMAGES_DIR.glob(f"{stem}*.jpg"))
    idx = len(existing)
    filename = f"{stem}_{idx:04d}.jpg"

    # Save image
    img_path = IMAGES_DIR / filename
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    cv2.imwrite(str(img_path), img)

    h, w = img.shape[:2]

    # Parse and save annotations in YOLO format
    bboxes = json.loads(annotations)
    label_path = LABELS_DIR / (Path(filename).stem + ".txt")

    with open(label_path, 'w') as f:
        for box in bboxes:
            # box: {x1, y1, x2, y2} in pixel coords
            cx = ((box['x1'] + box['x2']) / 2) / w
            cy = ((box['y1'] + box['y2']) / 2) / h
            bw = (box['x2'] - box['x1']) / w
            bh = (box['y2'] - box['y1']) / h
            f.write(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")

    return JSONResponse({
        "filename": filename,
        "annotations_saved": len(bboxes),
        "total_training_images": len(list(IMAGES_DIR.glob("*.jpg"))),
    })


@app.get("/training/images")
async def list_training_images():
    """List all training images with their annotation counts."""
    images = []
    for img_path in sorted(IMAGES_DIR.glob("*.jpg")):
        label_path = LABELS_DIR / (img_path.stem + ".txt")
        count = 0
        if label_path.exists():
            with open(label_path) as f:
                count = sum(1 for line in f if line.strip())
        images.append({
            "filename": img_path.name,
            "annotations": count,
        })
    return JSONResponse({"images": images, "total": len(images)})


@app.get("/training/image/{filename}")
async def get_training_image(filename: str):
    """Get a training image as base64 with its annotations."""
    img_path = IMAGES_DIR / filename
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    with open(img_path, 'rb') as f:
        img_bytes = f.read()

    # Load image dimensions
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]

    # Load annotations
    label_path = LABELS_DIR / (img_path.stem + ".txt")
    bboxes = []
    if label_path.exists():
        with open(label_path) as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) == 5:
                    _, cx, cy, bw, bh = map(float, parts)
                    x1 = (cx - bw / 2) * w
                    y1 = (cy - bh / 2) * h
                    x2 = (cx + bw / 2) * w
                    y2 = (cy + bh / 2) * h
                    bboxes.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2})

    return JSONResponse({
        "filename": filename,
        "image": image_to_base64(img_bytes),
        "width": w,
        "height": h,
        "annotations": bboxes,
    })


@app.delete("/training/image/{filename}")
async def delete_training_image(filename: str):
    """Delete a training image and its label."""
    img_path = IMAGES_DIR / filename
    label_path = LABELS_DIR / (Path(filename).stem + ".txt")
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    img_path.unlink()
    if label_path.exists():
        label_path.unlink()
    return JSONResponse({"deleted": filename})


@app.put("/training/image/{filename}/annotations")
async def update_annotations(filename: str, body: dict):
    """Update annotations for a training image."""
    img_path = IMAGES_DIR / filename
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    nparr = np.fromfile(str(img_path), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]

    bboxes = body.get("annotations", [])
    label_path = LABELS_DIR / (img_path.stem + ".txt")
    with open(label_path, 'w') as f:
        for box in bboxes:
            cx = ((box['x1'] + box['x2']) / 2) / w
            cy = ((box['y1'] + box['y2']) / 2) / h
            bw = (box['x2'] - box['x1']) / w
            bh = (box['y2'] - box['y1']) / h
            f.write(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")

    return JSONResponse({"updated": filename, "annotations": len(bboxes)})


@app.post("/train")
async def start_training(
    epochs: int = Form(50),
    imgsz: int = Form(640),
):
    """Start YOLOv8 training on uploaded training images."""
    img_count = len(list(IMAGES_DIR.glob("*.jpg")))
    if img_count < 2:
        raise HTTPException(status_code=400, detail=f"Need at least 2 training images, have {img_count}")

    # Write dataset YAML
    dataset_config = {
        "path": str(DATA_DIR.resolve()),
        "train": "train/images",
        "val": "train/images",  # use same for small datasets; user can split later
        "names": {0: "colony"},
        "nc": 1,
    }
    with open(DATASET_YAML, 'w') as f:
        yaml.dump(dataset_config, f)

    # Run training in a subprocess so it doesn't block (fire and forget)
    # For simplicity return a message; in production use background tasks
    base = str(MODEL_PATH) if MODEL_PATH.exists() else BASE_MODEL
    cmd = [
        "python", "-c",
        f"""
from ultralytics import YOLO
import shutil, pathlib, os
os.chdir(r'{str(BASE_DIR)}')
model = YOLO('{base}')
results = model.train(
    data=r'{str(DATASET_YAML)}',
    epochs={epochs},
    imgsz={imgsz},
    project=r'{str(MODELS_DIR)}',
    name='run',
    exist_ok=True,
)
# YOLO may nest under runs/detect/ — search for best.pt
models_dir = pathlib.Path(r'{str(MODELS_DIR)}')
candidates = list(models_dir.rglob('best.pt'))
if candidates:
    best = max(candidates, key=lambda p: p.stat().st_mtime)
    shutil.copy(best, r'{str(MODEL_PATH)}')
    print(f'Model saved: {{best}} -> {str(MODEL_PATH)}')
"""
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(BASE_DIR),
    )

    return JSONResponse({
        "status": "training_started",
        "pid": proc.pid,
        "images": img_count,
        "epochs": epochs,
        "message": "Training started in background. Reload the model when done.",
    })


@app.get("/model/status")
async def model_status():
    """Check if a custom trained model exists."""
    if MODEL_PATH.exists():
        stat = MODEL_PATH.stat()
        return JSONResponse({
            "has_custom_model": True,
            "model_path": str(MODEL_PATH),
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "modified": stat.st_mtime,
        })
    return JSONResponse({
        "has_custom_model": False,
        "using": BASE_MODEL,
    })
