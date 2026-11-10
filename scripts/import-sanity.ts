/**
 * Copy published truckModel images into the binder as pending photos.
 *
 * Dry run (no downloads, no writes):
 *   npm run import:sanity
 * Write (needs DATABASE_URL_UNPOOLED and the R2 vars):
 *   BINDER_CONFIRM=1 npm run import:sanity
 *
 * Idempotent: sha256 is the original bytes. A repeat skips rows that already exist.
 * Each photo is stored once, as a WebP capped at 1600px on the long edge.
 */
import { createClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import { withDirectClient } from '../src/lib/binder/db'
import { BINDER_WRITE_ENV, requireEnvs } from '../src/lib/binder/env'
import { MAX_ORIGINAL_BYTES } from '../src/lib/binder/images'
import {
  assertSanityCdnUrl,
  collectImages,
  parseImageRef,
  sanityImageUrl,
  type FoundImage,
} from '../src/lib/binder/sanityImages'
import { storeOriginalPhoto } from '../src/lib/binder/store-photo'
import { apiVersion, dataset, projectId } from '../src/lib/sanityConfig'

type TruckDoc = {
  _id: string
  title?: string
  slug?: { current?: string }
}

function notesFor(image: FoundImage): string | null {
  const parts = [image.alt, image.caption].filter((part): part is string => Boolean(part?.trim()))
  if (parts.length === 0) return null
  return parts.join(' — ').slice(0, 2000)
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (type.startsWith('text/')) throw new Error('not an image')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error('empty image')
  if (bytes.length > MAX_ORIGINAL_BYTES) throw new Error('image too large')
  return bytes
}

async function assetUrls(
  client: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100)
    const rows = await client.fetch<Array<{ _id: string; url?: string | null }>>(
      '*[_id in $ids]{ _id, url }',
      { ids: slice },
    )
    for (const row of rows) {
      if (row.url) urls.set(row._id, row.url)
    }
  }
  return urls
}

async function main() {
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const docs = await client.fetch<TruckDoc[]>(
    `*[_type == "truckModel" && !(_id in path("drafts.**"))]`,
  )
  const trucks = docs.filter((doc) => !doc._id.startsWith('drafts.') && !doc._id.startsWith('versions.'))
  const planned: Array<{ doc: TruckDoc; slug: string; image: FoundImage }> = []
  let missingSlug = 0
  let noImages = 0
  for (const doc of trucks) {
    const slug = doc.slug?.current
    if (!slug) {
      missingSlug += 1
      console.log(`skip ${doc._id} no slug`)
      continue
    }
    const images = collectImages(doc)
    const seen = new Set<string>()
    const unique = images.filter((image) => {
      if (seen.has(image.assetRef)) return false
      seen.add(image.assetRef)
      return true
    })
    if (unique.length === 0) {
      noImages += 1
      console.log(`none ${slug}`)
      continue
    }
    for (const image of unique) planned.push({ doc, slug, image })
  }
  console.log(`${trucks.length} trucks, ${planned.length} images, ${noImages} with none`)
  if (missingSlug > 0) console.log(`${missingSlug} trucks missing a slug`)
  if (!writesEnabled()) {
    console.log('Dry run. Set BINDER_CONFIRM=1 to download, compress, and insert pending rows.')
    return
  }

  requireEnvs(BINDER_WRITE_ENV)

  const ids = [...new Set(planned.flatMap((item) => {
    const parsed = parseImageRef(item.image.assetRef)
    return parsed ? [parsed.assetId] : []
  }))]
  const urls = await assetUrls(client, ids)
  let inserted = 0
  let skipped = 0
  let failed = 0

  await withDirectClient(async (db) => {
    for (const item of planned) {
      const parsed = parseImageRef(item.image.assetRef)
      const url = (parsed && urls.get(parsed.assetId)) || sanityImageUrl(item.image.assetRef, projectId, dataset)
      if (!url) {
        failed += 1
        console.log(`fail ${item.slug} unreadable ref`)
        continue
      }
      try {
        assertSanityCdnUrl(url)
        const original = await download(url)
        const outcome = await storeOriginalPhoto(db, {
          original,
          truckId: item.doc._id,
          truckSlug: item.slug,
          source: 'sanity',
          sourceUrl: url,
          author: null,
          license: null,
          notes: notesFor(item.image),
        })
        if (outcome === 'inserted') {
          inserted += 1
          console.log(`ok ${item.slug}`)
        } else {
          skipped += 1
          console.log(`skip ${item.slug} already stored`)
        }
      } catch (error) {
        failed += 1
        const name = error instanceof Error ? error.name : 'Error'
        console.log(`fail ${item.slug} ${name}`)
      }
    }
  })

  console.log(`inserted ${inserted}, skipped ${skipped}, failed ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`sanity import failed (${name})`)
  process.exit(1)
})
