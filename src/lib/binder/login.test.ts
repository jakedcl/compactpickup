import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/admin/photos/[id]/route'
import { proxy } from '../../proxy'
import { requestLoginCode, verifyLoginCode } from './login'
import { isSameOrigin } from './origin'

const ADMIN = 'admin@example.com'

type CodeRow = {
  id: string
  email: string
  codeHash: string
  expiresAt: number
  attempts: number
  consumedAt: number | null
  createdAt: number
}

type AttemptRow = {
  email: string | null
  ip: string | null
  kind: string
  success: boolean
  createdAt: number
}

class MemoryDb {
  now = Date.now()
  codes: CodeRow[] = []
  attempts: AttemptRow[] = []
  queries: string[] = []
  private nextId = 1

  advance(ms: number) {
    this.now += ms
  }

  pool() {
    return {
      connect: async () => ({
        query: async <T>(text: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> => {
          this.queries.push(text)
          return { rows: this.exec(text, params) as T[] }
        },
        release() {},
      }),
    }
  }

  exec(text: string, params: readonly unknown[]): unknown[] {
    const sql = text.replace(/\s+/g, ' ').trim()
    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return []
    if (sql.startsWith('select pg_advisory_xact_lock')) return [{}]
    if (sql.startsWith('delete from login_attempts')) {
      this.attempts = this.attempts.filter((row) => row.createdAt >= this.now - 30 * 24 * 60 * 60 * 1000)
      return []
    }
    if (sql.startsWith('delete from login_codes where created_at')) {
      this.codes = this.codes.filter((row) => row.createdAt >= this.now - 30 * 24 * 60 * 60 * 1000)
      return []
    }
    if (sql.startsWith('delete from login_codes where id')) {
      this.codes = this.codes.filter((row) => row.id !== params[0])
      return []
    }
    if (sql.includes("kind = 'request'") && sql.includes('count(*)')) {
      const [ip, secs] = params as [string, number]
      const n = this.attempts.filter(
        (row) => row.ip === ip && row.kind === 'request' && row.createdAt > this.now - secs * 1000,
      ).length
      return [{ n }]
    }
    if (sql.includes("kind = 'lockout'")) {
      const [email, secs] = params as [string, number]
      const row = this.attempts
        .filter((item) => item.email === email && item.kind === 'lockout' && item.createdAt > this.now - secs * 1000)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      return row ? [{ created_at: new Date(row.createdAt) }] : []
    }
    if (sql.includes("kind = 'verify'") && sql.includes('count(*)')) {
      const [email, secs] = params as [string, number]
      const n = this.attempts.filter(
        (row) =>
          row.email === email &&
          row.kind === 'verify' &&
          row.success === false &&
          row.createdAt > this.now - secs * 1000,
      ).length
      return [{ n }]
    }
    if (sql.includes('as cooling')) {
      const [email, secs] = params as [string, number]
      const row = this.codes.find((item) => item.email === email && item.createdAt > this.now - secs * 1000)
      return row ? [{ cooling: 1 }] : []
    }
    if (sql.includes('count(*)') && sql.includes('where email = $1') && sql.includes('from login_codes')) {
      const [email, secs] = params as [string, number]
      const n = this.codes.filter((row) => row.email === email && row.createdAt > this.now - secs * 1000).length
      return [{ n }]
    }
    if (sql.includes('count(*)') && sql.includes('from login_codes')) {
      const [secs] = params as [number]
      const n = this.codes.filter((row) => row.createdAt > this.now - secs * 1000).length
      return [{ n }]
    }
    if (sql.startsWith('update login_codes set consumed_at = now() where email')) {
      const [email] = params as [string]
      for (const row of this.codes) {
        if (row.email === email && row.consumedAt === null) row.consumedAt = this.now
      }
      return []
    }
    if (sql.startsWith('update login_codes set consumed_at = now() where id')) {
      const [id] = params as [string]
      const row = this.codes.find((item) => item.id === id)
      if (row) row.consumedAt = this.now
      return []
    }
    if (sql.startsWith('update login_codes set attempts')) {
      const [id] = params as [string]
      const row = this.codes.find((item) => item.id === id)
      if (row) row.attempts += 1
      return []
    }
    if (sql.startsWith('insert into login_codes')) {
      const [email, codeHash, secs] = params as [string, string, number]
      const id = `code-${this.nextId}`
      this.nextId += 1
      this.codes.push({
        id,
        email,
        codeHash,
        expiresAt: this.now + secs * 1000,
        attempts: 0,
        consumedAt: null,
        createdAt: this.now,
      })
      return [{ id }]
    }
    if (sql.startsWith('insert into login_attempts')) {
      const [email, ip, kind, success] = params as [string | null, string | null, string, boolean]
      this.attempts.push({ email, ip, kind, success, createdAt: this.now })
      return []
    }
    if (sql.includes('from login_codes') && sql.includes('for update')) {
      const [email] = params as [string]
      const row = this.codes
        .filter((item) => item.email === email && item.consumedAt === null && item.expiresAt > this.now)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      return row ? [{ id: row.id, code_hash: row.codeHash, attempts: row.attempts }] : []
    }
    throw new Error(`unhandled sql: ${sql}`)
  }
}

function useAdmin() {
  const previous = process.env.ADMIN_EMAIL
  process.env.ADMIN_EMAIL = ADMIN
  return () => {
    if (previous === undefined) delete process.env.ADMIN_EMAIL
    else process.env.ADMIN_EMAIL = previous
  }
}

async function issueCode(db: MemoryDb, sent: string[]) {
  await requestLoginCode(ADMIN, '203.0.113.5', {
    pool: db.pool(),
    send: async (_to, code) => {
      sent.push(code)
    },
  })
  const code = sent.at(-1)
  assert.ok(code)
  return code
}

test('wrong email does not send a code or lock the admin out', async () => {
  const restore = useAdmin()
  const db = new MemoryDb()
  const sent: string[] = []
  try {
    await requestLoginCode('other@example.com', '203.0.113.9', {
      pool: db.pool(),
      send: async () => {
        sent.push('nope')
      },
    })
    assert.equal(sent.length, 0)
    assert.equal(db.codes.length, 0)
    const code = await issueCode(db, sent)
    for (let i = 0; i < 10; i += 1) {
      assert.equal(await verifyLoginCode('other@example.com', '00000000', '203.0.113.9', { pool: db.pool() }), false)
    }
    assert.equal(await verifyLoginCode(ADMIN, code, '203.0.113.5', { pool: db.pool() }), true)
    assert.equal(db.attempts.filter((row) => row.kind === 'lockout').length, 0)
  } finally {
    restore()
  }
})

test('a code expires, is single use, and stops after five wrong guesses', async () => {
  const restore = useAdmin()
  const db = new MemoryDb()
  const sent: string[] = []
  try {
    const first = await issueCode(db, sent)
    assert.equal(await verifyLoginCode(ADMIN, first, '203.0.113.5', { pool: db.pool() }), true)
    assert.equal(await verifyLoginCode(ADMIN, first, '203.0.113.5', { pool: db.pool() }), false)

    db.advance(61_000)
    const expiring = await issueCode(db, sent)
    db.advance(10 * 60 * 1000 + 1000)
    assert.equal(await verifyLoginCode(ADMIN, expiring, '203.0.113.5', { pool: db.pool() }), false)

    db.advance(61_000)
    const limited = await issueCode(db, sent)
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await verifyLoginCode(ADMIN, '11111111', '203.0.113.5', { pool: db.pool() }), false)
    }
    assert.equal(await verifyLoginCode(ADMIN, limited, '203.0.113.5', { pool: db.pool() }), false)
  } finally {
    restore()
  }
})

test('lockout follows failures on issued codes and then ends', async () => {
  const restore = useAdmin()
  const db = new MemoryDb()
  const sent: string[] = []
  try {
    await issueCode(db, sent)
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await verifyLoginCode(ADMIN, '22222222', '203.0.113.5', { pool: db.pool() }), false)
    }
    db.advance(61_000)
    const second = await issueCode(db, sent)
    for (let i = 0; i < 3; i += 1) {
      assert.equal(await verifyLoginCode(ADMIN, '33333333', '203.0.113.5', { pool: db.pool() }), false)
    }
    assert.equal(await verifyLoginCode(ADMIN, second, '203.0.113.5', { pool: db.pool() }), false)
    db.advance(15 * 60 * 1000 + 1000)
    const third = await issueCode(db, sent)
    assert.equal(await verifyLoginCode(ADMIN, third, '203.0.113.5', { pool: db.pool() }), true)
  } finally {
    restore()
  }
})

test('a failed email send is logged without the code and old rows are pruned', async () => {
  const restore = useAdmin()
  const db = new MemoryDb()
  db.codes.push({
    id: 'old',
    email: ADMIN,
    codeHash: 'scrypt:aa:bb',
    expiresAt: 1,
    attempts: 0,
    consumedAt: 1,
    createdAt: db.now - 40 * 24 * 60 * 60 * 1000,
  })
  db.attempts.push({
    email: ADMIN,
    ip: '203.0.113.5',
    kind: 'verify',
    success: false,
    createdAt: db.now - 40 * 24 * 60 * 60 * 1000,
  })
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    await requestLoginCode(ADMIN, '203.0.113.5', {
      pool: db.pool(),
      send: async (_to, code) => {
        throw new Error(`resend failed for ${code} sk_live_secret`)
      },
    })
    assert.equal(db.codes.some((row) => row.id === 'old'), false)
    assert.equal(db.attempts.some((row) => row.createdAt < db.now - 30 * 24 * 60 * 60 * 1000), false)
    assert.equal(db.codes.length, 0)
    assert.ok(lines.some((line) => line.includes('login code email failed')))
    assert.ok(lines.every((line) => !line.includes('sk_live_secret') && !/\d{8}/.test(line)))
    assert.ok(db.queries.some((sql) => sql.includes("interval '30 days'")))
  } finally {
    console.error = original
    restore()
  }
})

test('proxy and the photo route reject a signed-out admin call', async () => {
  const denied = await proxy(new NextRequest('https://compactpickup.local/api/admin/photos/abc'))
  assert.equal(denied.status, 401)
  const page = await proxy(new NextRequest('https://compactpickup.local/binder'))
  assert.equal(page.status, 200)

  const previousSecret = process.env.AUTH_SECRET
  const previousAdmin = process.env.ADMIN_EMAIL
  process.env.AUTH_SECRET = 'test-secret-value-32-characters'
  process.env.ADMIN_EMAIL = ADMIN
  try {
    const response = await GET(new Request('https://compactpickup.local/api/admin/photos/x'), {
      params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }),
    })
    assert.equal(response.status, 401)
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
    if (previousAdmin === undefined) delete process.env.ADMIN_EMAIL
    else process.env.ADMIN_EMAIL = previousAdmin
  }
})

test('origin check matches the request host', () => {
  const same = new Request('https://compactpickup.local/api/auth/request', {
    headers: { origin: 'https://compactpickup.local' },
  })
  const cross = new Request('https://compactpickup.local/api/auth/request', {
    headers: { origin: 'https://evil.example' },
  })
  const forwarded = new Request('http://internal/api/auth/request', {
    headers: {
      origin: 'https://compactpickup.local',
      'x-forwarded-host': 'compactpickup.local',
      'x-forwarded-proto': 'https',
    },
  })
  assert.equal(isSameOrigin(same), true)
  assert.equal(isSameOrigin(cross), false)
  assert.equal(isSameOrigin(forwarded), true)
})
