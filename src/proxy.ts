import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminEmail, authSecret } from '@/lib/binder/env'
import { SESSION_COOKIE, readSessionToken } from '@/lib/binder/session'

async function sessionEmail(request: NextRequest): Promise<string | null> {
  const secret = authSecret()
  const admin = adminEmail()
  if (!secret || !admin) return null
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await readSessionToken(token, secret)
  if (!session || session.email !== admin) return null
  return session.email
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/admin')) {
    const email = await sessionEmail(request)
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // /admin itself stays reachable so the sign-in form can render.
  // Photo counts are loaded in the page only after the cookie checks out.
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin', '/api/admin/:path*'],
}
