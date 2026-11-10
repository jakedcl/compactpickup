import { MAX_UPLOAD_BYTES } from '@/lib/binder/limits'

export const UPLOAD_LONG_EDGE = 2000

export function fittedSize(
  width: number,
  height: number,
  max = UPLOAD_LONG_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(max > 0)) throw new Error('bad size')
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function drawBlob(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob | null> {
  const size = fittedSize(bitmap.width, bitmap.height, edge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  return (await blobFromCanvas(canvas, 'image/webp', quality)) ?? (await blobFromCanvas(canvas, 'image/jpeg', quality))
}

/** Keep a phone upload under the request limit. The server still stores one 1600px WebP. */
export async function fileForUpload(file: File): Promise<Blob> {
  const raster = /image\/(jpeg|png|webp)/i.test(file.type)
  if (raster && file.size > 0 && file.size <= MAX_UPLOAD_BYTES) return file
  const bitmap = await createImageBitmap(file)
  try {
    for (const edge of [UPLOAD_LONG_EDGE, 1600, 1200]) {
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await drawBlob(bitmap, edge, quality)
        if (blob && blob.size > 0 && blob.size <= MAX_UPLOAD_BYTES) return blob
      }
    }
  } finally {
    bitmap.close()
  }
  if (file.size > 0 && file.size <= MAX_UPLOAD_BYTES) return file
  throw new Error('That photo is too large.')
}
