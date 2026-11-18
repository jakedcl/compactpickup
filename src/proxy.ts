import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminEmail, authSecret } from '@/lib/binder/env'
import { catalogPathKind, shouldRewriteUnknownCatalogPath } from '@/lib/catalogPaths'
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

  if (pathname === '/catalog-miss') {
    return new NextResponse(null, { status: 404 })
  }

  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
    const email = await sessionEmail(request)
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (catalogPathKind(pathname) !== 'none' && (await shouldRewriteUnknownCatalogPath(pathname))) {
    return NextResponse.rewrite(new URL('/catalog-miss', request.url), { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/binder',
    '/binder/:path*',
    '/api/admin',
    '/api/admin/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}