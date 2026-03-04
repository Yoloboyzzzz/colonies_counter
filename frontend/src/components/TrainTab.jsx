import { useState, useRef, useEffect } from 'react'
import AnnotationCanvas from './AnnotationCanvas'
import {
  uploadTrainingImage,
  listTrainingImages,
  getTrainingImage,
  deleteTrainingImage,
  updateAnnotations,
  startTraining,
  getModelStatus,
} from '../api'

export default function TrainTab() {
  const [trainingImages, setTrainingImages] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFilename, setSelectedFilename] = useState(null)  // filename on server
  const [displayImageSrc, setDisplayImageSrc] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [savedAnnotations, setSavedAnnotations] = useState([])  // last saved state
  const [annotationsDirty, setAnnotationsDirty] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)  // new file not yet uploaded
  const [pendingAnnotations, setPendingAnnotations] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [training, setTraining] = useState(false)
  const [trainResult, setTrainResult] = useState(null)
  const [modelStatus, setModelStatus] = useState(null)
  const [error, setError] = useState(null)
  const [epochs, setEpochs] = useState(50)
  const [imgsz, setImgsz] = useState(640)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadTrainingImages()
    loadModelStatus()
  }, [])

  const loadTrainingImages = async () => {
    try {
      const data = await listTrainingImages()
      setTrainingImages(data.images)
    } catch (e) {
      setError(e.message)
    }
  }

  const loadModelStatus = async () => {
    try {
      const data = await getModelStatus()
      setModelStatus(data)
    } catch (e) { /* backend may not be running */ }
  }

  const handleNewFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    const url = URL.createObjectURL(f)
    setPendingFile(f)
    setPendingAnnotations([])
    setDisplayImageSrc(url)
    setAnnotations([])
    setSelectedFilename(null)
    setAnnotationsDirty(false)
    setError(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleNewFile(f)
  }

  const selectServerImage = async (filename) => {
    // Save current if dirty
    if (annotationsDirty && selectedFilename) {
      await saveAnnotations(selectedFilename, annotations)
    }
    setSelectedFilename(filename)
    setPendingFile(null)
    setError(null)
    try {
      const data = await getTrainingImage(filename)
      setDisplayImageSrc(`data:image/jpeg;base64,${data.image}`)
      setAnnotations(data.annotations)
      setSavedAnnotations(data.annotations)
      setAnnotationsDirty(false)
    } catch (e) {
      setError(e.message)
    }
  }

  const saveAnnotations = async (filename, anns) => {
    setSaving(true)
    try {
      await updateAnnotations(filename, anns)
      setSavedAnnotations([...anns])
      setAnnotationsDirty(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    try {
      const data = await uploadTrainingImage(pendingFile, annotations)
      await loadTrainingImages()
      // Switch to the uploaded image
      setPendingFile(null)
      await selectServerImage(data.filename)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (filename, e) => {
    e.stopPropagation()
    if (!confirm(`Delete ${filename}?`)) return
    try {
      await deleteTrainingImage(filename)
      if (selectedFilename === filename) {
        setSelectedFilename(null)
        setDisplayImageSrc(null)
        setAnnotations([])
      }
      await loadTrainingImages()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleTrain = async () => {
    setTraining(true)
    setTrainResult(null)
    setError(null)
    try {
      const data = await startTraining(epochs, imgsz)
      setTrainResult(data)
      setTimeout(loadModelStatus, 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setTraining(false)
    }
  }

  const onAnnotationsChange = (newAnns) => {
    setAnnotations(newAnns)
    if (selectedFilename) {
      setAnnotationsDirty(true)
    }
  }

  return (
    <div className="train-layout">
      {/* Left: image list + upload */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="panel">
          <div className="panel-title">Training Images ({trainingImages.length})</div>

          {/* Upload new */}
          <div
            className={`upload-area ${dragging ? 'drag-over' : ''}`}
            style={{ padding: '1rem', marginBottom: '0.75rem' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleNewFile(e.target.files[0])}
            />
            <div>+ Add image</div>
          </div>

          {pendingFile && (
            <div className="alert alert-info" style={{ marginBottom: '0.5rem' }}>
              Ready to upload: <strong>{pendingFile.name}</strong>
              <br />Draw boxes, then upload.
            </div>
          )}

          {pendingFile && (
            <button
              className="btn btn-success"
              onClick={handleUpload}
              disabled={uploading}
              style={{ marginBottom: '0.75rem' }}
            >
              {uploading ? <><span className="spinner" /> Uploading…</> : `⬆ Upload (${annotations.length} boxes)`}
            </button>
          )}

          {/* Image grid */}
          <div className="image-grid">
            {trainingImages.map((img) => (
              <div
                key={img.filename}
                className={`grid-item ${selectedFilename === img.filename ? 'selected' : ''}`}
                onClick={() => selectServerImage(img.filename)}
              >
                <ImgThumb filename={img.filename} />
                <span className="badge">{img.annotations}</span>
                <button className="del-btn" onClick={(e) => handleDelete(img.filename, e)}>✕</button>
              </div>
            ))}
          </div>

          {trainingImages.length === 0 && !pendingFile && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
              No training images yet.
            </p>
          )}
        </div>

        {/* Model status */}
        {modelStatus && (
          <div className="panel">
            <div className="panel-title">Model</div>
            {modelStatus.has_custom_model ? (
              <div className="alert alert-success">
                Custom model active<br />
                <span style={{ fontSize: '0.75rem' }}>{modelStatus.size_mb} MB</span>
              </div>
            ) : (
              <div className="alert alert-info">
                Using pretrained YOLOv8n<br />
                <span style={{ fontSize: '0.75rem' }}>Train with your images to improve</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: annotation canvas */}
      <div className="panel" style={{ padding: '0.75rem' }}>
        <div className="panel-title">
          {pendingFile ? `New: ${pendingFile.name}` : selectedFilename ? selectedFilename : 'Annotation Canvas'}
        </div>
        {displayImageSrc ? (
          <>
            <p className="mode-indicator">
              Draw bounding boxes around each colony. Click a box to select, then delete.
            </p>
            <AnnotationCanvas
              imageSrc={displayImageSrc}
              annotations={annotations}
              onChange={onAnnotationsChange}
              maxWidth={900}
            />
            {selectedFilename && annotationsDirty && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => saveAnnotations(selectedFilename, annotations)}
                disabled={saving}
              >
                {saving ? <><span className="spinner" /> Saving…</> : '💾 Save annotations'}
              </button>
            )}
          </>
        ) : (
          <div className="canvas-placeholder" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: '3rem' }}>🖊</div>
            <p>Select an image from the list or upload a new one</p>
          </div>
        )}
        {error && <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>⚠ {error}</div>}
      </div>

      {/* Right: training controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="panel">
          <div className="panel-title">Train YOLOv8</div>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Epochs</span>
                <span>{epochs}</span>
              </div>
              <input
                type="range" min="10" max="300" step="10"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
              />
            </div>
            <div className="slider-row">
              <div className="slider-label">
                <span>Image size</span>
                <span>{imgsz}px</span>
              </div>
              <input
                type="range" min="320" max="1280" step="32"
                value={imgsz}
                onChange={(e) => setImgsz(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {trainingImages.length} image{trainingImages.length !== 1 ? 's' : ''} available.
            {trainingImages.length < 2 && ' Need at least 2 to train.'}
          </div>

          <button
            className="btn btn-success"
            onClick={handleTrain}
            disabled={training || trainingImages.length < 2}
          >
            {training ? <><span className="spinner" /> Starting…</> : '🚀 Start Training'}
          </button>

          {trainResult && (
            <div className="alert alert-success" style={{ marginTop: '0.75rem' }}>
              Training started (PID {trainResult.pid}).<br />
              {trainResult.epochs} epochs on {trainResult.images} images.<br />
              <span style={{ fontSize: '0.75rem' }}>
                Check backend console for progress. The model will auto-update when done.
              </span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Instructions</div>
          <ol style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
            <li>Upload petri dish images</li>
            <li>Draw boxes around every colony</li>
            <li>Save annotations</li>
            <li>Repeat for at least 10+ images</li>
            <li>Click Start Training</li>
            <li>Switch to Detect tab to use your model</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// Tiny component to show a thumbnail from the server
function ImgThumb({ filename }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    getTrainingImage(filename).then((d) => {
      setSrc(`data:image/jpeg;base64,${d.image}`)
    }).catch(() => {})
  }, [filename])

  if (!src) return <div style={{ width: '100%', height: '100%', background: '#1a1d27' }} />
  return <img src={src} alt={filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
}
