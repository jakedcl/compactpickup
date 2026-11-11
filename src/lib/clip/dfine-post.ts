import { VEHICLE_LABELS, type NormDetection } from '@/lib/clip/crop-select'

export function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x >= 0) {
    const z = Math.exp(-x)
    return 1 / (1 + z)
  }
  const z = Math.exp(x)
  return z / (1 + z)
}

/** Normalized center box → normalized corner box (still 0–1). */
export function cxcywhNormToXyxyNorm(cx: number, cy: number, w: number, h: number): [number, number, number, number] {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
}

type LogitsBoxes = {
  logits: { dims: number[]; data: Float32Array | number[] }
  pred_boxes: { dims: number[]; data: Float32Array | number[] }
}

function read(data: Float32Array | number[], index: number): number {
  return Number(data[index])
}

/**
 * D-FINE / RT-DETR-style decode for browser ONNX: sigmoid on class logits, cxcywh→xyxy,
 * then scale to the original image size (width for x, height for y), returned as 0–1 fractions.
 */
export function postProcessDfineDetections(
  outputs: LogitsBoxes,
  id2label: Record<string, string>,
  imageWidth: number,
  imageHeight: number,
  threshold = 0.5,
): NormDetection[] {
  const numQueries = outputs.pred_boxes.dims[1] ?? 0
  const numClasses = outputs.logits.dims[2] ?? 0
  if (numQueries < 1 || numClasses < 1 || imageWidth < 1 || imageHeight < 1) return []

  const vehicleClassIndices: { idx: number; label: string }[] = []
  for (const [key, label] of Object.entries(id2label)) {
    if (VEHICLE_LABELS.has(label)) vehicleClassIndices.push({ idx: Number(key), label })
  }

  const detections: NormDetection[] = []
  for (let q = 0; q < numQueries; q += 1) {
    let bestScore = 0
    let bestLabel = ''
    for (const { idx, label } of vehicleClassIndices) {
      const logit = read(outputs.logits.data, q * numClasses + idx)
      const score = sigmoid(logit)
      if (score > bestScore) {
        bestScore = score
        bestLabel = label
      }
    }
    if (bestScore < threshold) continue

    const boxBase = q * 4
    const cx = read(outputs.pred_boxes.data, boxBase)
    const cy = read(outputs.pred_boxes.data, boxBase + 1)
    const bw = read(outputs.pred_boxes.data, boxBase + 2)
    const bh = read(outputs.pred_boxes.data, boxBase + 3)
    const [nx0, ny0, nx1, ny1] = cxcywhNormToXyxyNorm(cx, cy, bw, bh)
    const x0px = nx0 * imageWidth
    const y0px = ny0 * imageHeight
    const x1px = nx1 * imageWidth
    const y1px = ny1 * imageHeight
    detections.push({
      label: bestLabel,
      score: bestScore,
      x0: Math.min(1, Math.max(0, x0px / imageWidth)),
      y0: Math.min(1, Math.max(0, y0px / imageHeight)),
      x1: Math.min(1, Math.max(0, x1px / imageWidth)),
      y1: Math.min(1, Math.max(0, y1px / imageHeight)),
    })
  }
  return detections
}
