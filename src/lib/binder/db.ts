import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { requireEnv } from '@/lib/binder/env'

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireEnv('DATABASE_URL'),
      max: 3,
      idleTimeoutMillis: 10_000,
    })
  }
  return pool
}

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params)
}

/** Direct Neon connection for migrations and imports. Caller owns the pool. */
export async function withDirectClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const direct = new Pool({
    connectionString: requireEnv('DATABASE_URL_UNPOOLED'),
    max: 1,
  })
  const client = await direct.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
    await direct.end()
  }
}

export type { PoolClient }
