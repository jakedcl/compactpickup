import type { ClipProgress } from '@/lib/clip/browser'
import { DFINE_BROWSER_MODEL, SIGLIP_BROWSER_MODEL } from '@/lib/clip/pipeline'

/** Byte or percent progress from transformers.js when available. */
export function clipProgressPercent(progress: ClipProgress): number | null {
  if (progress.status === 'progress' && typeof progress.progress === 'number' && Number.isFinite(progress.progress)) {
    return Math.min(100, Math.max(0, progress.progress))
  }
  const { loaded, total } = progress
  if (typeof loaded === 'number' && typeof total === 'number' && total > 0) {
    return Math.min(100, Math.max(0, (loaded / total) * 100))
  }
  return null
}

function progressHint(progress: ClipProgress): string {
  return `${progress.name ?? ''} ${progress.file ?? ''}`.toLowerCase()
}

export function isDfineProgress(progress: ClipProgress): boolean {
  const hint = progressHint(progress)
  return hint.includes('dfine') || hint.includes('d_fine') || hint.includes(DFINE_BROWSER_MODEL.toLowerCase())
}

export function isSiglipProgress(progress: ClipProgress): boolean {
  const hint = progressHint(progress)
  return hint.includes('siglip') || hint.includes(SIGLIP_BROWSER_MODEL.toLowerCase())
}
