import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * Canvas-based annotation tool.
 * Props:
 *   imageSrc   - base64 or URL of the image
 *   annotations - [{x1,y1,x2,y2}] in original image pixel coords
 *   onChange   - called with new annotations array
 *   width/height - display canvas size
 */
export default function AnnotationCanvas({ imageSrc, annotations, onChange, maxWidth = 800 }) {
  const canvasRef = useRef(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 400 })
  const [drawing, setDrawing] = useState(false)
  const [startPt, setStartPt] = useState(null)
  const [tempBox, setTempBox] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)

  // Scale: canvas coords → image coords
  const scale = imgNatural.w > 0 ? imgNatural.w / canvasSize.w : 1

  const loadImage = useCallback(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalHeight / img.naturalWidth
      const w = Math.min(maxWidth, img.naturalWidth)
      const h = Math.round(w * ratio)
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setCanvasSize({ w, h })
    }
    img.src = imageSrc
  }, [imageSrc, maxWidth])

  useEffect(() => { loadImage() }, [loadImage])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageSrc) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Draw saved annotations
      annotations.forEach((box, i) => {
        const x = box.x1 / scale
        const y = box.y1 / scale
        const w = (box.x2 - box.x1) / scale
        const h = (box.y2 - box.y1) / scale
        ctx.strokeStyle = i === selectedIdx ? '#f87171' : '#34d399'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = i === selectedIdx ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.1)'
        ctx.fillRect(x, y, w, h)
        // Label
        ctx.fillStyle = i === selectedIdx ? '#f87171' : '#34d399'
        ctx.font = '12px sans-serif'
        ctx.fillText(`#${i + 1}`, x + 3, y + 14)
      })

      // Draw in-progress box
      if (tempBox) {
        const { x, y, w, h } = tempBox
        ctx.strokeStyle = '#4f8ef7'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(79,142,247,0.1)'
        ctx.fillRect(x, y, w, h)
      }
    }
    img.src = imageSrc
  }, [imageSrc, annotations, tempBox, canvasSize, selectedIdx, scale])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const onMouseDown = (e) => {
    const pos = getPos(e)

    // Check if clicking on existing box for selection
    for (let i = annotations.length - 1; i >= 0; i--) {
      const box = annotations[i]
      const bx = box.x1 / scale
      const by = box.y1 / scale
      const bw = (box.x2 - box.x1) / scale
      const bh = (box.y2 - box.y1) / scale
      if (pos.x >= bx && pos.x <= bx + bw && pos.y >= by && pos.y <= by + bh) {
        setSelectedIdx(i)
        return
      }
    }

    // Start new box
    setSelectedIdx(null)
    setDrawing(true)
    setStartPt(pos)
    setTempBox({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  const onMouseMove = (e) => {
    if (!drawing || !startPt) return
    const pos = getPos(e)
    const x = Math.min(pos.x, startPt.x)
    const y = Math.min(pos.y, startPt.y)
    const w = Math.abs(pos.x - startPt.x)
    const h = Math.abs(pos.y - startPt.y)
    setTempBox({ x, y, w, h })
  }

  const onMouseUp = (e) => {
    if (!drawing || !tempBox) return
    setDrawing(false)

    if (tempBox.w < 5 || tempBox.h < 5) {
      setTempBox(null)
      return
    }

    // Convert canvas coords → image coords
    const newBox = {
      x1: tempBox.x * scale,
      y1: tempBox.y * scale,
      x2: (tempBox.x + tempBox.w) * scale,
      y2: (tempBox.y + tempBox.h) * scale,
    }
    onChange([...annotations, newBox])
    setTempBox(null)
  }

  const deleteSelected = () => {
    if (selectedIdx === null) return
    const next = annotations.filter((_, i) => i !== selectedIdx)
    onChange(next)
    setSelectedIdx(null)
  }

  const clearAll = () => {
    onChange([])
    setSelectedIdx(null)
  }

  return (
    <div>
      <div className="annotator-canvas-wrap" style={{ cursor: 'crosshair' }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { if (drawing) { setDrawing(false); setTempBox(null) } }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          className="btn btn-sm btn-danger"
          onClick={deleteSelected}
          disabled={selectedIdx === null}
        >
          Delete selected
        </button>
        <button
          className="btn btn-sm"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          onClick={clearAll}
          disabled={annotations.length === 0}
        >
          Clear all
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
