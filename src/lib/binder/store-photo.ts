import type { PoolClient } from 'pg'
import { compressToThumb, compressToWebp, sha256Hex } from '@/lib/binder/images'
import { insertPendingPhoto, photoIdForSha256, type PendingPhoto } from '@/lib/binder/photos'
import { photoObjectKey, putPhoto, thumbObjectKey } from '@/lib/binder/r2'

type StoreInput = Omit<PendingPhoto, 'r2Key' | 'width' | 'height' | 'sha256'> & {
  original: Buffer
}

/** Compress, upload the WebP, and insert a pending row. Skips when sha256 already exists. */
export async function storeOriginalPhoto(
  client: PoolClient,
  input: StoreInput,
): Promise<'inserted' | 'duplicate'> {
  const sha256 = sha256Hex(input.original)
  const existing = await photoIdForSha256(client, sha256)
  if (existing) return 'duplicate'
  const prepared = await compressToWebp(input.original)
  const r2Key = photoObjectKey(sha256)
  await putPhoto(r2Key, prepared.data)
  try {
    const thumb = await compressToThumb(prepared.data)
    await putPhoto(thumbObjectKey(sha256), thumb)
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    console.error(`binder: thumb upload failed (${name})`)
  }
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
    sha256,
    notes: input.notes,
  })
}
