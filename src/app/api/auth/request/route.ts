import { NextResponse } from 'next/server'
import { clientIp, readJsonObject, stringField } from '@/lib/binder/http'
import { REQUEST_MESSAGE, requestLoginCode } from '@/lib/binder/login'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ ok: false, message: 'Enter an email.' }, { status: 400 })
  const email = stringField(body, 'email')
  if (!email.trim()) return NextResponse.json({ ok: false, message: 'Enter an email.' }, { status: 400 })
  try {
    await requestLoginCode(email, clientIp(request))
  } catch {
    console.error('binder: login request failed')
  }
  return NextResponse.json(
    { ok: true, message: REQUEST_MESSAGE },
    { headers: { 'cache-control': 'no-store' } },
  )
}
