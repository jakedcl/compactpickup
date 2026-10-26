type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS = 20

const globalStore = globalThis as typeof globalThis & {
  __scanRateLimit?: Map<string, Bucket>
}

function store(): Map<string, Bucket> {
  if (!globalStore.__scanRateLimit) globalStore.__scanRateLimit = new Map()
  return globalStore.__scanRateLimit
}

export function checkScanRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const map = store()
  const bucket = map.get(key)
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }
  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count += 1
  return { ok: true }
}

export function clientRateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'
  return ip
}
