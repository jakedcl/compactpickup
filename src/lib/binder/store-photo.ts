import type { PoolClient } from 'pg'
import { prepareStoredPhoto } from '@/lib/binder/images'
import { insertPendingPhoto, photoIdForSha256, type PendingPhoto } from '@/lib/binder/photos'
import { photoObjectKey, putPhoto } from '@/lib/binder/r2'

type StoreInput = Omit<PendingPhoto, 'r2Key' | 'width' | 'height' | 'sha256'> & {
  original: Buffer
}

/** Compress, upload the WebP, and insert a pending row. Skips when sha256 already exists. */
export async function storeOriginalPhoto(
  client: PoolClient,
  input: StoreInput,
): Promise<'inserted' | 'duplicate'> {
  const prepared = await prepareStoredPhoto(input.original)
  const existing = await photoIdForSha256(client, prepared.sha256)
  if (existing) return 'duplicate'
  const r2Key = photoObjectKey(prepared.sha256)
  await putPhoto(r2Key, prepared.webp)
  return insertPendingPhoto(client, {
    truckId: input.truckId,
    truckSlug: input.truckSlug,
    source: input.source,
    sourceUrl: input.sourceUrl,
    author: input.author,
    license: input.license,
    r2Key,
    width: prepared.width,
    height: prepared.height,
    sha256: prepared.sha256,
    notes: input.notes,
  })
}
