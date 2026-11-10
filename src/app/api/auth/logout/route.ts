import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/binder/session-cookie'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
