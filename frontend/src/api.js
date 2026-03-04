const BASE = 'http://localhost:8000'

export async function detectColonies(file, brightness, contrast, confidence) {
  const form = new FormData()
  form.append('file', file)
  form.append('brightness', brightness)
  form.append('contrast', contrast)
  form.append('confidence', confidence)
  const res = await fetch(`${BASE}/detect`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function adjustImage(file, brightness, contrast) {
  const form = new FormData()
  form.append('file', file)
  form.append('brightness', brightness)
  form.append('contrast', contrast)
  const res = await fetch(`${BASE}/adjust`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadTrainingImage(file, annotations) {
  const form = new FormData()
  form.append('file', file)
  form.append('annotations', JSON.stringify(annotations))
  const res = await fetch(`${BASE}/training/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listTrainingImages() {
  const res = await fetch(`${BASE}/training/images`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getTrainingImage(filename) {
  const res = await fetch(`${BASE}/training/image/${encodeURIComponent(filename)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteTrainingImage(filename) {
  const res = await fetch(`${BASE}/training/image/${encodeURIComponent(filename)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateAnnotations(filename, annotations) {
  const res = await fetch(`${BASE}/training/image/${encodeURIComponent(filename)}/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startTraining(epochs, imgsz) {
  const form = new FormData()
  form.append('epochs', epochs)
  form.append('imgsz', imgsz)
  const res = await fetch(`${BASE}/train`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getModelStatus() {
  const res = await fetch(`${BASE}/model/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
