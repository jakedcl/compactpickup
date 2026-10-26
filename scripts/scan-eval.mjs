/**
 * Leave-one-image-out eval: for each truck gallery image, match against
 * truck centroids built from the other images, then report top-1 accuracy.
 */
import { createClient } from '@sanity/client'
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectId = 'xbw6uf6e'
const dataset = 'production'
const MODEL = 'Xenova/clip-vit-base-patch32'
const INDEX_PATH = path.join(process.cwd(), 'src/data/scan-embeddings.json')

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: true,
})

const query = `*[_type == "truckModel" && defined(slug.current) && defined(manufacturer->slug.current)] {
  _id,
  "makerSlug": manufacturer->slug.current,
  "modelSlug": slug.current,
  "images": content[_type == "image" && defined(asset)]{ asset, _key }
}`

function imageUrlFromRef(ref) {
  const [, id, dims, format] = ref.split('-')
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dims}.${format}?w=512&h=512&fit=crop&auto=format`
}

function dot(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

function l2Normalize(vector) {
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm) || 1
  return vector.map((v) => v / norm)
}

async function main() {
  const rows = await client.fetch(query)
  const extractor = await pipeline('image-feature-extraction', MODEL, { quantized: true })

  const truckImages = []
  for (const row of rows) {
    for (const image of row.images ?? []) {
      const ref = image?.asset?._ref
      if (!ref) continue
      try {
        const output = await extractor(imageUrlFromRef(ref), { pooling: 'mean', normalize: true })
        truckImages.push({
          truckId: row._id,
          slug: `${row.makerSlug}/${row.modelSlug}`,
          vector: l2Normalize(Array.from(output.data)),
        })
      } catch (error) {
        console.warn('skip', error.message)
      }
    }
  }

  const byTruck = new Map()
  for (const item of truckImages) {
    if (!byTruck.has(item.truckId)) byTruck.set(item.truckId, [])
    byTruck.get(item.truckId).push(item)
  }

  let correct = 0
  let total = 0
  const confusions = []

  for (const [truckId, items] of byTruck) {
    if (items.length < 2) continue
    for (const held of items) {
      const centroids = []
      for (const [otherId, otherItems] of byTruck) {
        const vectors =
          otherId === truckId
            ? otherItems.filter((x) => x !== held).map((x) => x.vector)
            : otherItems.map((x) => x.vector)
        if (!vectors.length) continue
        for (const vector of vectors) {
          centroids.push({
            truckId: otherId,
            slug: otherItems[0].slug,
            vector,
          })
        }
      }
      const q = l2Normalize(held.vector)
      const byTruckBest = new Map()
      for (const row of centroids) {
        const score = dot(q, row.vector)
        const prev = byTruckBest.get(row.truckId)
        if (!prev || score > prev.score) byTruckBest.set(row.truckId, { ...row, score })
      }
      const ranked = [...byTruckBest.values()].sort((a, b) => b.score - a.score)
      const top = ranked[0]
      total += 1
      if (top.truckId === truckId) correct += 1
      else confusions.push({ expected: held.slug, got: top.slug, score: top.score })
    }
  }

  const accuracy = total ? (correct / total) * 100 : 0
  console.log(`Held-out image top-1 accuracy: ${accuracy.toFixed(1)}% (${correct}/${total})`)
  if (confusions.length) {
    console.log('Sample misses:')
    for (const row of confusions.slice(0, 8)) {
      console.log(`  expected ${row.expected}, got ${row.got} (${row.score.toFixed(3)})`)
    }
  }

  try {
    const index = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'))
    console.log(`Index on disk: ${index.trucks?.length ?? 0} trucks, built ${index.builtAt}`)
  } catch {
    console.log('No committed index file yet. Run npm run scan:build-index')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
