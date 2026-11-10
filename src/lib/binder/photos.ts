import type { PoolClient } from 'pg'
import { PHOTO_STATUSES, type PhotoSource, type PhotoStatus } from '@/lib/binder/types'
import { query } from '@/lib/binder/db'

export type PhotoCounts = Record<PhotoStatus, number>

export type PendingPhoto = {
  truckId: string
  truckSlug: string
  source: PhotoSource
  sourceUrl: string | null
  author: string | null
  license: string | null
  r2Key: string
  width: number
  height: number
  sha256: string
  notes: string | null
}

export async function photoCounts(): Promise<PhotoCounts> {
  const result = await query<{ status: string; n: number | string }>(
    `select status, count(*)::int as n from photos group by status`,
  )
  const counts = Object.fromEntries(PHOTO_STATUSES.map((status) => [status, 0])) as PhotoCounts
  for (const row of result.rows) {
    if (!(PHOTO_STATUSES as readonly string[]).includes(row.status)) continue
    const n = Number(row.n)
    counts[row.status as PhotoStatus] = Number.isFinite(n) ? n : 0
  }
  return counts
}

export async function photoKey(id: string): Promise<string | null> {
  const result = await query<{ r2_key: string }>(`select r2_key from photos where id = $1`, [id])
  return result.rows[0]?.r2_key ?? null
}

export async function photoIdForSha256(client: PoolClient, sha256: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(`select id from photos where sha256 = $1`, [sha256])
  return result.rows[0]?.id ?? null
}

export async function insertPendingPhoto(
  client: PoolClient,
  photo: PendingPhoto,
): Promise<'inserted' | 'duplicate'> {
  const result = await client.query<{ id: string }>(
    `insert into photos (
       truck_id, truck_slug, status, source, source_url, author, license,
       r2_key, width, height, sha256, notes
     ) values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (sha256) do nothing
     returning id`,
    [
      photo.truckId,
      photo.truckSlug,
      photo.source,
      photo.sourceUrl,
      photo.author,
      photo.license,
      photo.r2Key,
      photo.width,
      photo.height,
      photo.sha256,
      photo.notes,
    ],
  )
  return result.rows.length > 0 ? 'inserted' : 'duplicate'
}
