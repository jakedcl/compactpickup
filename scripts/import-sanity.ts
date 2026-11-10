/**
 * Copy published truckModel images into the binder as pending photos.
 *
 * Dry run (no downloads, no writes):
 *   npm run import:sanity
 * Write (needs DATABASE_URL_UNPOOLED and the R2 vars):
 *   BINDER_CONFIRM=1 npm run import:sanity
 *
 * Each download is a Sanity CDN derivative (max 2000px JPEG), never the original file.
 * A repeat skips a photo whose canonical CDN URL or sha256 is already stored.
 * The stored file is one WebP capped at 1600px on the long edge, plus a grid thumb.
 */
import { createClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import { BINDER_WRITE_ENV, requireEnvs } from '../src/lib/binder/env'
import { collectImages } from '../src/lib/binder/sanityImages'
import { importAllSanityPhotos } from '../src/lib/binder/sanitySync'
import { apiVersion, dataset, projectId } from '../src/lib/sanityConfig'

type TruckDoc = {
  _id: string
  slug?: { current?: string }
}

async function main() {
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const docs = await client.fetch<TruckDoc[]>(
    `*[_type == "truckModel" && !(_id in path("drafts.**"))]`,
  )
  const trucks = docs.filter((doc) => !doc._id.startsWith('drafts.') && !doc._id.startsWith('versions.'))
  let images = 0
  let missingSlug = 0
  let noImages = 0
  for (const doc of trucks) {
    const slug = doc.slug?.current
    if (!slug) {
      missingSlug += 1
      console.log(`skip ${doc._id} no slug`)
      continue
    }
    const seen = new Set<string>()
    let count = 0
    for (const image of collectImages(doc)) {
      if (seen.has(image.assetRef)) continue
      seen.add(image.assetRef)
      count += 1
    }
    if (count === 0) {
      noImages += 1
      console.log(`none ${slug}`)
      continue
    }
    images += count
  }
  console.log(`${trucks.length} trucks, ${images} images, ${noImages} with none`)
  if (missingSlug > 0) console.log(`${missingSlug} trucks missing a slug`)
  if (!writesEnabled()) {
    console.log('Dry run. Set BINDER_CONFIRM=1 to download derivatives, compress, and insert pending rows.')
    return
  }

  requireEnvs(BINDER_WRITE_ENV)
  const result = await importAllSanityPhotos((line) => console.log(line))
  console.log(`inserted ${result.inserted}, skipped ${result.skipped}, failed ${result.failed}`)
  if (result.failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`sanity import failed (${name})`)
  process.exit(1)
})
