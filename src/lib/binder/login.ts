import 'server-only'

import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { PoolClient } from 'pg'
import { getPool, query } from '@/lib/binder/db'
import { sendLoginCode } from '@/lib/binder/email'
import { adminEmail } from '@/lib/binder/env'

const scryptAsync = promisify(scrypt)

const CODE_TTL_SECONDS = 10 * 60
const CODE_MAX_ATTEMPTS = 5
const LOCKOUT_WINDOW_SECONDS = 15 * 60
const LOCKOUT_MAX_FAILURES = 8
const SEND_WINDOW_SECONDS = 15 * 60
const SEND_MAX = 5
const SEND_COOLDOWN_SECONDS = 60

export const REQUEST_MESSAGE = 'If that address can sign in, a code is on the way.'
export const VERIFY_MESSAGE = 'Check the code and try again.'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254)
}

function generateLoginCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, '0')
}

async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = (await scryptAsync(code, salt, 32)) as Buffer
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`
}

async function verifyCodeHash(code: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split(':')
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64url')
  if (expected.length === 0) return false
  const actual = (await scryptAsync(code, Buffer.from(saltB64, 'base64url'), expected.length)) as Buffer
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

async function logAttempt(
  client: PoolClient,
  email: string,
  ip: string | null,
  kind: 'request' | 'verify',
  success: boolean,
) {
  await client.query(
    `insert into login_attempts (email, ip, kind, success) values ($1, $2, $3, $4)`,
    [email || null, ip, kind, success],
  )
}

async function ipOverLimit(client: PoolClient, ip: string | null): Promise<boolean> {
  if (!ip) return false
  const result = await client.query<{ n: number | string }>(
    `select count(*)::int as n from login_attempts
     where ip = $1 and kind = 'request'
       and created_at > now() - make_interval(secs => $2)`,
    [ip, SEND_WINDOW_SECONDS],
  )
  return Number(result.rows[0]?.n ?? 0) >= LOCKOUT_MAX_FAILURES
}

export async function requestLoginCode(rawEmail: string, ip: string | null): Promise<void> {
  const email = normalizeEmail(rawEmail)
  const admin = adminEmail()
  const allowed = Boolean(admin && email === admin)
  const client = await getPool().connect()
  let pending: { id: string; code: string } | null = null
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock(hashtext($1)::bigint)`, [`login:${email}`])
    const blocked = await ipOverLimit(client, ip)
    if (!allowed || blocked) {
      await logAttempt(client, email, ip, 'request', false)
      await client.query('commit')
      if (!admin) console.error('binder: ADMIN_EMAIL is not set')
      return
    }

    const recent = await client.query<{ n: number | string; latest: Date | null }>(
      `select count(*)::int as n, max(created_at) as latest
       from login_codes
       where email = $1 and created_at > now() - make_interval(secs => $2)`,
      [email, SEND_WINDOW_SECONDS],
    )
    const count = Number(recent.rows[0]?.n ?? 0)
    const latest = recent.rows[0]?.latest ? new Date(recent.rows[0].latest).getTime() : 0
    const cooling = latest > 0 && Date.now() - latest < SEND_COOLDOWN_SECONDS * 1000
    if (count >= SEND_MAX || cooling) {
      await logAttempt(client, email, ip, 'request', false)
      await client.query('commit')
      return
    }

    await client.query(
      `update login_codes set consumed_at = now()
       where email = $1 and consumed_at is null`,
      [email],
    )
    const code = generateLoginCode()
    const codeHash = await hashCode(code)
    const inserted = await client.query<{ id: string }>(
      `insert into login_codes (email, code_hash, expires_at)
       values ($1, $2, now() + make_interval(secs => $3))
       returning id`,
      [email, codeHash, CODE_TTL_SECONDS],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new Error('login code was not stored')
    pending = { id, code }
    await logAttempt(client, email, ip, 'request', true)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  if (!pending) return
  try {
    await sendLoginCode(email, pending.code)
  } catch {
    console.error('binder: login code email failed')
    await query(`delete from login_codes where id = $1`, [pending.id]).catch(() => {
      console.error('binder: could not drop unsent login code')
    })
  }
}

export async function verifyLoginCode(
  rawEmail: string,
  code: string,
  ip: string | null,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail)
  const admin = adminEmail()
  const client = await getPool().connect()
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock(hashtext($1)::bigint)`, [`login:${email}`])
    const failures = await client.query<{ n: number | string }>(
      `select count(*)::int as n from login_attempts
       where email = $1 and kind = 'verify' and success = false
         and created_at > now() - make_interval(secs => $2)`,
      [email, LOCKOUT_WINDOW_SECONDS],
    )
    if (Number(failures.rows[0]?.n ?? 0) >= LOCKOUT_MAX_FAILURES) {
      await client.query('commit')
      return false
    }

    const shapeOk = /^\d{8}$/.test(code)
    if (!admin || email !== admin || !shapeOk) {
      await hashCode(code || '00000000')
      await logAttempt(client, email, ip, 'verify', false)
      await client.query('commit')
      return false
    }

    const found = await client.query<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts
       from login_codes
       where email = $1 and consumed_at is null and expires_at > now()
       order by created_at desc
       limit 1
       for update`,
      [email],
    )
    const row = found.rows[0]
    if (!row || row.attempts >= CODE_MAX_ATTEMPTS) {
      await hashCode(code)
      await logAttempt(client, email, ip, 'verify', false)
      await client.query('commit')
      return false
    }

    const match = await verifyCodeHash(code, row.code_hash)
    if (!match) {
      await client.query(`update login_codes set attempts = attempts + 1 where id = $1`, [row.id])
      await logAttempt(client, email, ip, 'verify', false)
      await client.query('commit')
      return false
    }

    await client.query(`update login_codes set consumed_at = now() where id = $1`, [row.id])
    await logAttempt(client, email, ip, 'verify', true)
    await client.query('commit')
    return true
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
