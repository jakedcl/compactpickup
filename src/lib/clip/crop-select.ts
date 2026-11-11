import {
  CENTRALITY_DIVISOR,
  CROP_PAD,
  DETECT_SCORE_THRESHOLD,
  MIN_VEHICLE_BOX_AREA,
} from '@/lib/clip/pipeline'

export const VEHICLE_LABELS = new Set(['car', 'truck', 'bus'])

export type NormDetection = {
  label: string
  score: number
  /** 0–1 relative to the original image width/height */
  x0: number
  y0: number
  x1: number
  y1: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** Mirrors run_crop.py selection: area ≥ 5%, car/truck/bus, score ≥ threshold, best area × centrality blend. */
export function pickVehicleBox(
  detections: NormDetection[],
  options: { threshold?: number; minArea?: number } = {},
): NormDetection | null {
  const threshold = options.threshold ?? DETECT_SCORE_THRESHOLD
  const minArea = options.minArea ?? MIN_VEHICLE_BOX_AREA
  let best: { value: number; det: NormDetection } | null = null
  for (const det of detections) {
    if (!VEHICLE_LABELS.has(det.label)) continue
    if (det.score < threshold) continue
    const x0 = clamp01(det.x0)
    const y0 = clamp01(det.y0)
    const x1 = clamp01(det.x1)
    const y1 = clamp01(det.y1)
    const area = (x1 - x0) * (y1 - y0)
    if (area < minArea) continue
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const central = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) / CENTRALITY_DIVISOR)
    const value = area * (0.5 + 0.5 * central)
    if (!best || value > best.value) best = { value, det: { ...det, x0, y0, x1, y1 } }
  }
  return best?.det ?? null
}

/** Padded crop in normalized coordinates (default pad 15% of box width/height). */
export function paddedCropNorm(
  box: Pick<NormDetection, 'x0' | 'y0' | 'x1' | 'y1'>,
  pad = CROP_PAD,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = clamp01(box.x0)
  const y0 = clamp01(box.y0)
  const x1 = clamp01(box.x1)
  const y1 = clamp01(box.y1)
  const w = x1 - x0
  const h = y1 - y0
  return {
    x0: clamp01(x0 - pad * w),
    y0: clamp01(y0 - pad * h),
    x1: clamp01(x1 + pad * w),
    y1: clamp01(y1 + pad * h),
  }
}
