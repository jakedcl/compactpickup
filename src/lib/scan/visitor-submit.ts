import {
  SCAN_CONSENT_VALUE,
  SCAN_FIELDS,
  type ScanCatalogTruck,
  type ScanVerdict,
} from '@/lib/binder/scan-types'
import { ClipError } from '@/lib/clip/browser'
import type { VisitorCorrection } from './visitor-session'

const UPLOAD_LONG_EDGE = 1600
const UPLOAD_JPEG_QUALITY = 0.85

/** Shown in the consent island after the visitor taps Yes and the upload succeeds. */
export const VISITOR_CONSENT_THANK_YOU = 'Thanks — this will help improve the scanner.'

export type VisitorSubmitOutcome = 'inserted' | 'duplicate' | 'error'

export type VisitorSubmitResult = {
  outcome: VisitorSubmitOutcome
  message: string
}

function messageFrom(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const message = (value as { message?: unknown }).message
  return typeof message === 'string' && message.length > 0 && message.length < 200 ? message : fallback
}

export async function shrinkVisitorJpeg(file: Blob): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ClipError('photo', 'Could not read the photo')
    const scale = Math.min(1, UPLOAD_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ClipError('photo', 'Could not read the photo')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY)
    })
    if (!blob || blob.size === 0) throw new ClipError('photo', 'Could not read the photo')
    return new File([blob], 'truck.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

export function buildVisitorSubmitFormData(
  upload: File,
  verdict: ScanVerdict,
  topGuess: ScanCatalogTruck,
  correction: VisitorCorrection | null,
): FormData {
  const body = new FormData()
  body.set(SCAN_FIELDS.photo, upload)
  body.set(SCAN_FIELDS.consent, SCAN_CONSENT_VALUE)
  body.set(SCAN_FIELDS.verdict, verdict)
  body.set(SCAN_FIELDS.guessedTruckId, topGuess.id)
  body.set(SCAN_FIELDS.guessedTruckSlug, topGuess.slug)
  if (verdict === 'wrong' && correction?.kind === 'catalog') {
    body.set(SCAN_FIELDS.correctedTruckId, correction.truck.id)
    body.set(SCAN_FIELDS.correctedTruckSlug, correction.truck.slug)
    body.set(SCAN_FIELDS.correctedTruckCustomText, '')
  } else if (verdict === 'wrong' && correction?.kind === 'custom') {
    body.set(SCAN_FIELDS.correctedTruckId, '')
    body.set(SCAN_FIELDS.correctedTruckSlug, '')
    body.set(SCAN_FIELDS.correctedTruckCustomText, correction.text)
  } else {
    body.set(SCAN_FIELDS.correctedTruckId, '')
    body.set(SCAN_FIELDS.correctedTruckSlug, '')
    body.set(SCAN_FIELDS.correctedTruckCustomText, '')
  }
  return body
}

export async function submitVisitorScanPhoto(
  file: File,
  verdict: ScanVerdict,
  topGuess: ScanCatalogTruck,
  correction: VisitorCorrection | null,
): Promise<VisitorSubmitResult> {
  let upload: File
  try {
    upload = await shrinkVisitorJpeg(file)
  } catch {
    return { outcome: 'error', message: 'That photo could not be read. Try another.' }
  }
  const body = buildVisitorSubmitFormData(upload, verdict, topGuess, correction)
  try {
    const response = await fetch('/api/scan/submit', { method: 'POST', body })
    const payload = await response.json().catch(() => null)
    if (response.status === 429 || !response.ok) {
      return {
        outcome: 'error',
        message: messageFrom(payload, 'Signal lost. The photo was not stored.'),
      }
    }
    const outcome = payload && typeof payload === 'object' ? (payload as { outcome?: unknown }).outcome : null
    if (outcome === 'duplicate') {
      return {
        outcome: 'duplicate',
        message: 'That photo is already in the library. Your note was saved.',
      }
    }
    if (outcome === 'inserted') {
      return {
        outcome: 'inserted',
        message: VISITOR_CONSENT_THANK_YOU,
      }
    }
    return { outcome: 'error', message: 'Signal lost. The photo was not stored.' }
  } catch {
    return { outcome: 'error', message: 'Signal lost. The photo was not stored.' }
  }
}
