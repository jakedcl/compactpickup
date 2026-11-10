import 'server-only'

import { cookies } from 'next/headers'
import { adminEmail, authSecret } from '@/lib/binder/env'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, readSessionToken, signSession } from '@/lib/binder/session'

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export async function getSession(): Promise<{ email: string } | null> {
  const secret = authSecret()
  const admin = adminEmail()
  if (!secret || !admin) return null
  let token: string | undefined
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value
  } catch {
    return null
  }
  if (!token) return null
  const session = await readSessionToken(token, secret)
  if (!session || session.email !== admin) return null
  return session
}

export async function setSessionCookie(email: string): Promise<void> {
  const secret = authSecret()
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const token = await signSession(email, secret)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS))
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, '', cookieOptions(0))
}
