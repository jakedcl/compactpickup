const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const SESSION_COOKIE = 'binder_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

type SessionPayload = {
  email: string
  exp: number
}

function assertSecret(secret: string) {
  if (secret.length < 16) throw new Error('AUTH_SECRET is too short')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return mismatch === 0
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function signSession(
  email: string,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  assertSecret(secret)
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await hmac(secret, body)
  return `${body}.${signature}`
}

export async function readSessionToken(
  token: string,
  secret: string,
): Promise<{ email: string } | null> {
  if (secret.length < 16) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (!body || !signature) return null
  const expected = await hmac(secret, body)
  if (!safeEqual(signature, expected)) return null
  try {
    const parsed = JSON.parse(decoder.decode(base64UrlToBytes(body))) as Partial<SessionPayload>
    if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return null
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    return { email: parsed.email }
  } catch {
    return null
  }
}
