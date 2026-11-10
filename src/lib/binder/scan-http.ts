import 'server-only'

import { getPool } from '@/lib/binder/db'
import { clientIp } from '@/lib/binder/http'
import { isSameOrigin } from '@/lib/binder/origin'
import { putPhoto } from '@/lib/binder/r2'
import {
  SCAN_BODY_MAX_BYTES,
  SUBMIT_BODY_MAX_BYTES,
  VISITOR_MAX_BYTES,
  normalizeScanEmbedding,
  runScan,
  submitVisitorPhoto,
  type ScanDeps,
  type SubmitDeps,
} from '@/lib/binder/scan'
import { SCAN_CONSENT_VALUE, SCAN_FIELDS, toScanTruck, type ScanCatalogTruck } from '@/lib/binder/scan-types'

const PHOTO_TYPES = new Set([
  '',
  'application/octet-stream',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
])

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

function originDenied(): Response {
  return json(
    { ok: false, error: 'origin', message: 'Open the scanner on this site and try again.' },
    403,
  )
}

async function defaultCatalog(): Promise<ScanCatalogTruck[]> {
  const { getCatalog } = await import('@/lib/getCatalog')
  const trucks = await getCatalog()
  return trucks.flatMap((truck) => {
    const option = toScanTruck(truck)
    return option ? [option] : []
  })
}

function defaultConnect(): ReturnType<ScanDeps['connect']> {
  return getPool().connect()
}

const defaultScanDeps: ScanDeps = {
  connect: defaultConnect,
  catalog: defaultCatalog,
  now: () => Date.now(),
}

const defaultSubmitDeps: SubmitDeps = {
  ...defaultScanDeps,
  putPhoto,
}

function declaredType(file: Blob): string {
  return file.type.split(';')[0]?.trim().toLowerCase() ?? ''
}

function formText(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value == null) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length > 256) return null
  return trimmed
}

export async function scanPost(request: Request, deps: ScanDeps = defaultScanDeps): Promise<Response> {
  if (!isSameOrigin(request)) return originDenied()
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > SCAN_BODY_MAX_BYTES) {
    return json({ ok: false, error: 'invalid', message: 'That scan was too large.' }, 413)
  }
  let text: string
  try {
    text = await request.text()
  } catch {
    return json({ ok: false, error: 'invalid', message: 'The scan was not readable.' }, 400)
  }
  if (text.length > SCAN_BODY_MAX_BYTES) {
    return json({ ok: false, error: 'invalid', message: 'That scan was too large.' }, 413)
  }
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    body = null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'invalid', message: 'The scan was not readable.' }, 400)
  }
  const vector = normalizeScanEmbedding((body as { embedding?: unknown }).embedding)
  if (!vector) {
    return json(
      { ok: false, error: 'invalid', message: 'The photo fingerprint was not a 512-number list.' },
      400,
    )
  }
  try {
    const result = await runScan(vector, clientIp(request), deps)
    if (!result.ok) return json({ ok: false, error: result.error, message: result.message }, result.status)
    return json({ ok: true, ...result.outcome })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    console.error(`scanner: match failed (${name})`)
    return json({ ok: false, error: 'offline', message: 'Signal lost. The scanner did not answer.' }, 500)
  }
}

export async function submitPost(request: Request, deps: SubmitDeps = defaultSubmitDeps): Promise<Response> {
  if (!isSameOrigin(request)) return originDenied()
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > SUBMIT_BODY_MAX_BYTES) {
    return json({ ok: false, error: 'size', message: 'That photo is too large. Use one under 4 MB.' }, 413)
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, error: 'invalid', message: 'The photo did not upload.' }, 400)
  }
  if (form.get(SCAN_FIELDS.consent) !== SCAN_CONSENT_VALUE) {
    return json(
      { ok: false, error: 'consent', message: 'Check the box to agree before sending the photo.' },
      400,
    )
  }
  const photo = form.get(SCAN_FIELDS.photo)
  if (!(photo instanceof Blob) || photo.size === 0) {
    return json({ ok: false, error: 'invalid', message: 'Choose a photo to send.' }, 400)
  }
  if (!PHOTO_TYPES.has(declaredType(photo))) {
    return json({ ok: false, error: 'type', message: 'Use a JPEG, PNG, or WebP photo.' }, 400)
  }
  if (photo.size > VISITOR_MAX_BYTES) {
    return json({ ok: false, error: 'size', message: 'That photo is too large. Use one under 4 MB.' }, 413)
  }
  const verdict = formText(form, SCAN_FIELDS.verdict)
  const guessedTruckId = formText(form, SCAN_FIELDS.guessedTruckId)
  const guessedTruckSlug = formText(form, SCAN_FIELDS.guessedTruckSlug)
  const correctedTruckId = formText(form, SCAN_FIELDS.correctedTruckId)
  const correctedTruckSlug = formText(form, SCAN_FIELDS.correctedTruckSlug)
  if (
    verdict == null
    || guessedTruckId == null
    || guessedTruckSlug == null
    || correctedTruckId == null
    || correctedTruckSlug == null
  ) {
    return json({ ok: false, error: 'invalid', message: 'The report was not readable.' }, 400)
  }
  let original: Buffer
  try {
    original = Buffer.from(await photo.arrayBuffer())
  } catch {
    return json({ ok: false, error: 'invalid', message: 'The photo did not upload.' }, 400)
  }
  try {
    const result = await submitVisitorPhoto(
      {
        original,
        consent: true,
        verdict,
        guessedTruckId,
        guessedTruckSlug,
        correctedTruckId,
        correctedTruckSlug,
        ip: clientIp(request),
      },
      deps,
    )
    if (!result.ok) return json({ ok: false, error: result.error, message: result.message }, result.status)
    return json({ ok: true, outcome: result.outcome })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    console.error(`scanner: submit failed (${name})`)
    return json({ ok: false, error: 'offline', message: 'Signal lost. The photo was not stored.' }, 500)
  }
}
