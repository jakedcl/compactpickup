export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const raw = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || ''
  if (!raw) return null
  return raw.slice(0, 64)
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = (await request.json()) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

export function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  return typeof value === 'string' ? value : ''
}
