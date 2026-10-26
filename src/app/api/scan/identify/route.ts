import { getScanCatalog } from '@/lib/getScanCatalog'
import { identifyFromEmbeddingVector, identifyFromImage } from '@/lib/scan/identify'
import { checkScanRateLimit, clientRateLimitKey } from '@/lib/scan/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BODY_BYTES = 900_000

export async function POST(request: Request) {
  const rateKey = clientRateLimitKey(request)
  const limited = checkScanRateLimit(rateKey)
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many scans. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    )
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Image is too large.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const catalog = await getScanCatalog()
  if (!catalog.length) {
    return Response.json({ error: 'Catalog unavailable.' }, { status: 503 })
  }

  const embedding = (body as { embedding?: unknown }).embedding
  if (Array.isArray(embedding) && embedding.length > 0) {
    if (embedding.length > 2048 || !embedding.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return Response.json({ error: 'Invalid embedding.' }, { status: 400 })
    }
    const result = await identifyFromEmbeddingVector(embedding, catalog)
    return Response.json(result)
  }

  const imageBase64 = (body as { image?: unknown }).image
  const mimeType = (body as { mimeType?: unknown }).mimeType
  if (typeof imageBase64 !== 'string' || !imageBase64.length) {
    return Response.json({ error: 'Send a compressed image or embedding.' }, { status: 400 })
  }
  if (typeof mimeType !== 'string' || !/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    return Response.json({ error: 'Unsupported image type.' }, { status: 400 })
  }

  let bytes: Uint8Array
  try {
    const raw = Buffer.from(imageBase64, 'base64')
    if (raw.byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Image is too large.' }, { status: 413 })
    }
    bytes = new Uint8Array(raw)
  } catch {
    return Response.json({ error: 'Could not read image.' }, { status: 400 })
  }

  try {
    const result = await identifyFromImage(bytes, mimeType, catalog)
    return Response.json(result)
  } catch (error) {
    console.error('scan identify failed', error)
    return Response.json({ error: 'Could not identify this photo.' }, { status: 500 })
  }
}
