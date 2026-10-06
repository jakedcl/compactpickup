import { unstable_cache } from 'next/cache'
import { client, sanityImageFields } from '@/lib/sanity'
import type { SanityImageValue } from '@/lib/sanityImage'
import {
  decadesFor,
  driveFamily,
  engineFamily,
  gearFamily,
  marketFamilies,
  type CatalogTruck,
} from '@/lib/catalog'

type RawEngine = { name?: string | null; config?: string | null; displacement?: string | null }
type RawImage = SanityImageValue & { alt?: string | null }

type RawTruck = {
  _id: string
  title: string
  slug: string
  displayTitle?: string | null
  nameplate?: string | null
  generation?: string | null
  yearRange?: string | null
  productionStart?: number | null
  productionEnd?: number | null
  internalCodes?: string[] | null
  markets?: string[] | null
  drivetrains?: string[] | null
  transmissions?: string[] | null
  engines?: RawEngine[] | null
  siblings?: Array<string | null> | null
  maker?: { name?: string | null; slug?: string | null } | null
  image?: RawImage | null
}

const catalogQuery = `*[_type == "truckModel" && defined(slug.current) && defined(manufacturer)] | order(productionStart asc, title asc) {
  _id,
  title,
  "slug": slug.current,
  displayTitle,
  nameplate,
  generation,
  yearRange,
  productionStart,
  productionEnd,
  internalCodes,
  markets,
  drivetrains,
  transmissions,
  "engines": engines[]{name, config, displacement},
  "siblings": siblings[].name,
  "maker": manufacturer->{name, "slug": slug.current},
  "image": content[_type == "image"][0]{
    alt,
    ${sanityImageFields}
  }
}`

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function toCatalogTruck(truck: RawTruck): CatalogTruck | null {
  const maker = clean(truck.maker?.name)
  const makerSlug = clean(truck.maker?.slug)
  if (!maker || !makerSlug || !truck.slug) return null

  const start = typeof truck.productionStart === 'number' ? truck.productionStart : null
  const end = typeof truck.productionEnd === 'number' ? truck.productionEnd : null
  const years = clean(truck.yearRange) || (start ? `${start}–${end ?? 'now'}` : '')
  const drives = unique((truck.drivetrains ?? []).map((item) => driveFamily(item ?? '')))
  const engines = unique((truck.engines ?? []).map((engine) => engineFamily(engine.config ?? '')))
  const gears = unique((truck.transmissions ?? []).map((item) => gearFamily(item ?? '')))
  const markets = unique((truck.markets ?? []).flatMap((item) => marketFamilies(item ?? '')))
  const search = [
    truck.title,
    truck.displayTitle,
    truck.nameplate,
    truck.generation,
    maker,
    years,
    ...(truck.internalCodes ?? []),
    ...(truck.engines ?? []).flatMap((engine) => [engine.name, engine.config, engine.displacement]),
    ...(truck.siblings ?? []),
    ...drives,
    ...engines,
    ...markets,
    ...gears,
  ].filter(Boolean).join(' ').toLowerCase()

  const image = truck.image?.asset?._ref ? truck.image : null

  return {
    id: truck._id,
    title: truck.title,
    href: `/${makerSlug}/${truck.slug}`,
    maker,
    makerSlug,
    years,
    decades: decadesFor(start, end),
    drives,
    engines,
    markets,
    gears,
    search,
    image,
    alt: clean(image?.alt) || `${maker} ${truck.title}`,
  }
}

async function loadCatalog(): Promise<CatalogTruck[]> {
  const rows = await client.fetch<RawTruck[]>(catalogQuery)
  return (rows ?? []).map(toCatalogTruck).filter((truck): truck is CatalogTruck => truck !== null)
}

export const getCatalog = unstable_cache(loadCatalog, ['truck-catalog'], { revalidate: 3600 })
