/**
 * Reject cross-site POSTs. Phase 2 writes under /api/admin should call this first.
 * Existing auth POSTs use it too.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    if (origin === new URL(request.url).origin) return true
  } catch {
    return false
  }
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (!forwardedHost || !forwardedProto) return false
  return origin === `${forwardedProto}://${forwardedHost}`
}
