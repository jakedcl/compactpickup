/** Shrink so the long edge is at most maxEdge (same cap as pre-SigLIP embed). */
export function fitCanvasLongEdge(canvas: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const long = Math.max(canvas.width, canvas.height)
  if (long <= maxEdge) return canvas
  const scale = maxEdge / long
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const fitted = document.createElement('canvas')
  fitted.width = width
  fitted.height = height
  const ctx = fitted.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  ctx.drawImage(canvas, 0, 0, width, height)
  return fitted
}
