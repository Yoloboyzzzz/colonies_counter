# Colony Counter

YOLOv8-powered bacterial colony detection and counting tool.

## Quick Start

### Prerequisites
- Python 3.9+ (with pip)
- Node.js 18+

### 1. Install dependencies

```bat
setup.bat
```

### 2. Start the app

```bat
start.bat
```

Open **http://localhost:5173** in your browser.

---

## Features

### Detect Tab
- Upload a petri dish photo
- Adjust **brightness** and **contrast** with live preview
- Set **confidence threshold** to control detection sensitivity
- Run detection — colonies are counted and highlighted with bounding boxes
- Toggle between annotated (with boxes) and clean view

### Train Tab
- Upload your own petri dish images
- Draw bounding boxes around each colony using the annotation canvas
- Save annotations per image
- When you have ≥2 annotated images, click **Start Training** to fine-tune YOLOv8
- Training runs in the background; the backend console shows progress
- Once done, the custom model is automatically used for all future detections

---

## Architecture

```
colonies_counter/
├── backend/
│   ├── main.py          # FastAPI server + YOLOv8 inference & training
│   ├── requirements.txt
│   └── data/
│       ├── train/
│       │   ├── images/  # uploaded training images
│       │   └── labels/  # YOLO-format annotation files
│       └── models/
│           └── best.pt  # custom trained model (after training)
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js       # API calls to backend
│       └── components/
│           ├── DetectTab.jsx        # detection UI
│           ├── TrainTab.jsx         # training UI
│           └── AnnotationCanvas.jsx # canvas annotation tool
├── setup.bat
└── start.bat
```

## Tips for better results

- Use consistent lighting when photographing petri dishes
- Aim for ≥20 annotated images for good model accuracy
- Annotate all colonies, even partially visible ones at the edges
- Use the brightness/contrast sliders to improve image visibility before detecting
- Start with a low confidence threshold (~15%) to catch faint colonies
