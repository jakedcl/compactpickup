/**
 * Seed truck_faces from data/truck-faces.json.
 * Slugs are matched with GROQ. Unknown slugs abort before any write.
 *
 *   npm run seed:faces
 *   BINDER_CONFIRM=1 npm run seed:faces
 *
 * Re-running updates sort order for the same truck and label.
 * Labels removed from the JSON file are left in the database.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import { withDirectClient } from '../src/lib/binder/db'
import { requireEnv } from '../src/lib/binder/env'
import { apiVersion, dataset, projectId } from '../src/lib/sanityConfig'

type FaceFile = {
  trucks: Array<{ slug: string; title?: string; labels: string[] }>
}

type TruckHit = { _id: string; title: string; slug: string }

async function main() {
  const file = await readFile(path.join(process.cwd(), 'data', 'truck-faces.json'), 'utf8')
  const parsed = JSON.parse(file) as FaceFile
  const trucks = parsed.trucks ?? []
  const slugs = trucks.map((truck) => truck.slug)
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const found = await client.fetch<TruckHit[]>(
    `*[_type == "truckModel" && slug.current in $slugs && !(_id in path("drafts.**"))]{
      _id, title, "slug": slug.current
    }`,
    { slugs },
  )
  const bySlug = new Map(found.map((truck) => [truck.slug, truck]))
  let missing = 0
  for (const truck of trucks) {
    const hit = bySlug.get(truck.slug)
    if (!hit) {
      missing += 1
      console.log(`missing ${truck.slug}`)
      continue
    }
    console.log(`${truck.slug} ${hit._id} ${hit.title}`)
    truck.labels.forEach((label, index) => console.log(`  ${index} ${label}`))
  }
  if (missing > 0) {
    console.error(`${missing} slugs were not in Sanity. Nothing was written.`)
    process.exit(1)
  }
  if (!writesEnabled()) {
    console.log('Dry run. Set BINDER_CONFIRM=1 to upsert truck_faces.')
    return
  }
  requireEnv('DATABASE_URL_UNPOOLED')
  await withDirectClient(async (db) => {
    for (const truck of trucks) {
      const hit = bySlug.get(truck.slug)
      if (!hit) continue
      for (let index = 0; index < truck.labels.length; index += 1) {
        await db.query(
          `insert into truck_faces (truck_id, truck_slug, label, sort_order)
           values ($1, $2, $3, $4)
           on conflict (truck_id, label)
           do update set truck_slug = excluded.truck_slug, sort_order = excluded.sort_order`,
          [hit._id, truck.slug, truck.labels[index], index],
        )
      }
    }
  })
  console.log(`upserted faces for ${trucks.length} trucks`)
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`face seed failed (${name})`)
  process.exit(1)
})
