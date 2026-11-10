import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { requireEnv } from '@/lib/binder/env'
import { connectionStringForPg } from '@/lib/binder/pg-url'

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionStringForPg(requireEnv('DATABASE_URL')),
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

export async function withPooledClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

/** Direct Neon connection for migrations and imports. Caller owns the pool. */
export async function withDirectClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const direct = new Pool({
    connectionString: connectionStringForPg(requireEnv('DATABASE_URL_UNPOOLED')),
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
