import { useState, useRef, useCallback, useEffect } from 'react'
import { detectColonies, adjustImage } from '../api'

const DEBOUNCE_MS = 400

export default function DetectTab() {
  const [file, setFile] = useState(null)
  const [originalSrc, setOriginalSrc] = useState(null)
  const [displaySrc, setDisplaySrc] = useState(null)   // adjusted (no boxes)
  const [annotatedSrc, setAnnotatedSrc] = useState(null) // with boxes
  const [showAnnotated, setShowAnnotated] = useState(false)
  const [detections, setDetections] = useState(null)
  const [loading, setLoading] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(1.0)
  const [confidence, setConfidence] = useState(0.25)

  const adjustTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setOriginalSrc(url)
    setDisplaySrc(url)
    setAnnotatedSrc(null)
    setDetections(null)
    setShowAnnotated(false)
    setError(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  // Live preview: debounced adjust call when sliders change
  const debouncedAdjust = useCallback(() => {
    if (!file) return
    clearTimeout(adjustTimerRef.current)
    adjustTimerRef.current = setTimeout(async () => {
      setAdjusting(true)
      try {
        const data = await adjustImage(file, brightness, contrast)
        setDisplaySrc(`data:image/jpeg;base64,${data.adjusted_image}`)
        setAnnotatedSrc(null) // invalidate old detection
        setDetections(null)
        setShowAnnotated(false)
      } catch (e) {
        // silently fail on preview
      } finally {
        setAdjusting(false)
      }
    }, DEBOUNCE_MS)
  }, [file, brightness, contrast])

  useEffect(() => {
    debouncedAdjust()
  }, [brightness, contrast])

  const handleDetect = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await detectColonies(file, brightness, contrast, confidence)
      setDisplaySrc(`data:image/jpeg;base64,${data.adjusted_image}`)
      setAnnotatedSrc(`data:image/jpeg;base64,${data.annotated_image}`)
      setDetections(data)
      setShowAnnotated(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const resetSliders = () => {
    setBrightness(0)
    setContrast(1.0)
  }

  const currentImg = showAnnotated && annotatedSrc ? annotatedSrc : displaySrc

  return (
    <div className="layout">
      {/* Left panel: controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Upload */}
        <div className="panel">
          <div className="panel-title">Image</div>
          <div
            className={`upload-area ${dragging ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className="upload-icon">🧫</div>
            <div>{file ? file.name : 'Drop image or click to upload'}</div>
            <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Petri dish photo</div>
          </div>
        </div>

        {/* Image controls */}
        <div className="panel">
          <div className="panel-title">Image Adjustments</div>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Brightness</span>
                <span>{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
              <input
                type="range" min="-100" max="100" step="1"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
              />
            </div>
            <div className="slider-row">
              <div className="slider-label">
                <span>Contrast</span>
                <span>{contrast.toFixed(2)}×</span>
              </div>
              <input
                type="range" min="0.5" max="3.0" step="0.05"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
              />
            </div>
          </div>
          <button className="btn btn-sm" style={{ width: 'auto', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }} onClick={resetSliders}>
            Reset
          </button>
        </div>

        {/* Detection controls */}
        <div className="panel">
          <div className="panel-title">Detection</div>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Confidence threshold</span>
                <span>{(confidence * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min="0.05" max="0.95" step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleDetect}
            disabled={!file || loading}
          >
            {loading ? <><span className="spinner" /> Analyzing…</> : '🔍 Detect Colonies'}
          </button>
        </div>

        {/* Results */}
        {detections && (
          <div className="panel">
            <div className="panel-title">Results</div>
            <div style={{ textAlign: 'center' }}>
              <div className="count-badge">
                🦠 {detections.count} {detections.count === 1 ? 'colony' : 'colonies'} detected
              </div>
            </div>
            {detections.count > 0 && (
              <>
                <hr className="divider" />
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: showAnnotated ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)', color: showAnnotated ? 'white' : 'var(--text-muted)' }}
                    onClick={() => setShowAnnotated(true)}
                  >
                    Boxes
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: !showAnnotated ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)', color: !showAnnotated ? 'white' : 'var(--text-muted)' }}
                    onClick={() => setShowAnnotated(false)}
                  >
                    Clean
                  </button>
                </div>
                <div className="detection-list">
                  {detections.detections.map((d, i) => (
                    <div key={i} className="detection-item">
                      <span style={{ color: 'var(--text)' }}>#{i + 1} {d.class}</span>
                      <span style={{ color: 'var(--success)' }}>{(d.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && <div className="alert alert-warning">⚠ {error}</div>}
      </div>

      {/* Right: image viewer */}
      <div className="panel" style={{ padding: '0.75rem' }}>
        <div className="canvas-container" style={{ minHeight: 500 }}>
          {currentImg ? (
            <div style={{ position: 'relative', width: '100%' }}>
              <img
                src={currentImg}
                alt="Petri dish"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
              />
              {adjusting && (
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  adjusting…
                </div>
              )}
            </div>
          ) : (
            <div className="canvas-placeholder">
              <div style={{ fontSize: '4rem' }}>🧫</div>
              <p>Upload a petri dish image to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
