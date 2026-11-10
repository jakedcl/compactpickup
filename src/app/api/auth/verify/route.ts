import { NextResponse } from 'next/server'
import { adminEmail, authSecret } from '@/lib/binder/env'
import { clientIp, readJsonObject, stringField } from '@/lib/binder/http'
import { VERIFY_MESSAGE, verifyLoginCode } from '@/lib/binder/login'
import { isSameOrigin } from '@/lib/binder/origin'
import { setSessionCookie } from '@/lib/binder/session-cookie'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, message: VERIFY_MESSAGE }, { status: 403 })
  }
  const body = await readJsonObject(request)
  if (!body) {
    return NextResponse.json({ ok: false, message: VERIFY_MESSAGE }, { status: 401 })
  }
  const email = stringField(body, 'email')
  const code = stringField(body, 'code').trim()
  if (!email.trim()) return NextResponse.json({ ok: false, message: 'Enter an email.' }, { status: 400 })
  if (!code) return NextResponse.json({ ok: false, message: 'Enter the code.' }, { status: 400 })
  if (!authSecret() || !adminEmail()) {
    console.error('binder: auth env is not set')
    return NextResponse.json({ ok: false, message: VERIFY_MESSAGE }, { status: 401 })
  }
  try {
    const ok = await verifyLoginCode(email, code, clientIp(request))
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: VERIFY_MESSAGE },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      )
    }
    const admin = adminEmail()
    if (!admin) {
      return NextResponse.json({ ok: false, message: VERIFY_MESSAGE }, { status: 401 })
    }
    await setSessionCookie(admin)
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    console.error('binder: login verify failed')
    return NextResponse.json({ ok: false, message: VERIFY_MESSAGE }, { status: 401 })
  }
}
