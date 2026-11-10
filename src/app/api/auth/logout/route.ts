import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/binder/session-cookie'
import { isSameOrigin } from '@/lib/binder/origin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  await clearSessionCookie()
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
