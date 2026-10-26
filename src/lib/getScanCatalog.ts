import 'server-only'
import { unstable_cache } from 'next/cache'
import { client } from '@/lib/sanityClient'
import type { ScanCatalogEntry } from '@/lib/scan/types'

type RawScanTruck = {
  _id: string
  title: string
  generation?: string | null
  yearRange?: string | null
  modelSlug: string
  makerSlug: string
  maker: string
}

const scanCatalogQuery = `*[_type == "truckModel" && defined(slug.current) && defined(manufacturer->slug.current)] | order(productionStart asc, title asc) {
  _id,
  title,
  generation,
  yearRange,
  "modelSlug": slug.current,
  "makerSlug": manufacturer->slug.current,
  "maker": manufacturer->name
}`

function toEntry(row: RawScanTruck): ScanCatalogEntry | null {
  const maker = row.maker?.trim()
  const makerSlug = row.makerSlug?.trim()
  const modelSlug = row.modelSlug?.trim()
  if (!maker || !makerSlug || !modelSlug || !row.title) return null
  const years = typeof row.yearRange === 'string' ? row.yearRange.trim() : ''
  const generation = typeof row.generation === 'string' && row.generation.trim() ? row.generation.trim() : null
  return {
    id: row._id,
    title: row.title,
    maker,
    makerSlug,
    modelSlug,
    href: `/${makerSlug}/${modelSlug}`,
    years,
    generation,
  }
}

async function loadScanCatalog(): Promise<ScanCatalogEntry[]> {
  const rows = await client.fetch<RawScanTruck[]>(scanCatalogQuery)
  return (rows ?? []).map(toEntry).filter((entry): entry is ScanCatalogEntry => entry !== null)
}

export const getScanCatalog = unstable_cache(loadScanCatalog, ['scan-catalog'], { revalidate: 3600 })
