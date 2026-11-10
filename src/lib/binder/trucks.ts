import { createClient } from '@sanity/client'
import { apiVersion, dataset, projectId } from '@/lib/sanityConfig'

export type CatalogTruck = {
  id: string
  slug: string
  title: string
  maker: string
}

let cache: { at: number; trucks: CatalogTruck[] } | null = null

export async function listCatalogTrucks(): Promise<CatalogTruck[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.trucks
  const client = createClient({ projectId, dataset, apiVersion, useCdn: true })
  const rows = await client.fetch<
    Array<{ id?: string; slug?: string; title?: string | null; maker?: string | null }>
  >(
    `*[_type == "truckModel" && defined(slug.current) && !(_id in path("drafts.**"))] | order(title asc) {
      "id": _id,
      "slug": slug.current,
      title,
      "maker": manufacturer->name
    }`,
  )
  const trucks = rows.flatMap((row) => {
    if (!row.id || !row.slug || !row.title) return []
    if (row.id.startsWith('drafts.') || row.id.startsWith('versions.')) return []
    return [{ id: row.id, slug: row.slug, title: row.title, maker: row.maker ?? '' }]
  })
  cache = { at: Date.now(), trucks }
  return trucks
}
