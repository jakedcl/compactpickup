import { createClient } from '@sanity/client'
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectId = 'xbw6uf6e'
const dataset = 'production'
const MODEL = 'Xenova/clip-vit-base-patch32'
const OUT = path.join(process.cwd(), 'src/data/scan-embeddings.json')

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
  "images": content[_type == "image" && defined(asset)]{ asset }
}`

function imageUrlFromRef(ref) {
  const [, id, dims, format] = ref.split('-')
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dims}.${format}?w=512&h=512&fit=crop&auto=format`
}

function l2Normalize(vector) {
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm) || 1
  return vector.map((v) => v / norm)
}

function meanVector(vectors) {
  const dim = vectors[0].length
  const acc = new Array(dim).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += vec[i]
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length
  return l2Normalize(acc)
}

async function main() {
  const rows = await client.fetch(query)
  console.log(`Trucks: ${rows.length}`)
  const extractor = await pipeline('image-feature-extraction', MODEL, { quantized: true })

  const trucks = []
  for (const row of rows) {
    const imageVectors = []
    for (const image of row.images ?? []) {
      const ref = image?.asset?._ref
      if (!ref) continue
      try {
        const url = imageUrlFromRef(ref)
        const output = await extractor(url, { pooling: 'mean', normalize: true })
        imageVectors.push(l2Normalize(Array.from(output.data)))
      } catch (error) {
        console.warn(`Skip image for ${row.modelSlug}:`, error.message)
      }
    }
    if (!imageVectors.length) {
      console.warn(`No embeddings for ${row.makerSlug}/${row.modelSlug}`)
      continue
    }
    trucks.push({
      truckId: row._id,
      makerSlug: row.makerSlug,
      modelSlug: row.modelSlug,
      vector: meanVector(imageVectors),
      imageVectors,
      imageCount: imageVectors.length,
    })
    console.log(`Indexed ${row.makerSlug}/${row.modelSlug} (${imageVectors.length} photos)`)
  }

  const index = {
    version: 1,
    model: MODEL,
    dimension: trucks[0]?.vector.length ?? 512,
    builtAt: new Date().toISOString(),
    trucks,
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, JSON.stringify(index))
  console.log(`Wrote ${OUT} (${trucks.length} trucks)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
