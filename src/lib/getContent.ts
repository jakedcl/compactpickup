import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { TruckImageData } from '@/components/ImageCarousel'
import type { ShelfManufacturer } from '@/components/TapeShelf'
import type { TimelineTruck } from '@/components/TruckTimelineCard'
import type { TruckModel } from '@/components/TruckModelView'
import { buildDeck, type GameStill } from '@/lib/gameDeck'
import { client } from '@/lib/sanityClient'
import type { SanityImageValue } from '@/lib/sanityImage'
import {
  allTruckImagesQuery,
  manufacturerBySlugQuery,
  manufacturerParamsQuery,
  manufacturersQuery,
  groupedTruckModelsQuery,
  timelineQuery,
  truckModelBySlugQuery,
  truckModelsByManufacturerQuery,
  truckParamsQuery,
} from '@/lib/sanity'
import { FEATURED_MAKE_SLUGS, isCatchAllMake, showsOnShelf } from '@/lib/makes'
import { compareTrucksByYear } from '@/lib/truckDisplay'

const hour = { revalidate: 3600 }

export type ManufacturerRecord = {
  _id: string
  name: string
  slug: { current: string }
  founded?: string | null
  hq?: string | null
  country?: string | null
  website?: string | null
  description?: string | null
  compactPickupHistory?: string | null
  featured?: boolean | null
  isCatchAll?: boolean | null
  logo?: SanityImageValue | null
}

export type ManufacturerTruckRecord = {
  _id: string
  title: string
  slug: { current: string }
  yearRange?: string | null
  productionStart?: number | null
  productionEnd?: number | null
  manufacturer: {
    name: string
    slug: { current: string }
  }
}

function sortManufacturers(data: ShelfManufacturer[]) {
  return [...data].sort((a, b) => {
    if (a.name === "More..." || a.name === "One-Off's") return 1
    if (b.name === "More..." || b.name === "One-Off's") return -1
    return a.name.localeCompare(b.name)
  })
}

function flattenImages(trucks: Array<{ images?: Array<GameStill | null> | null }> | null) {
  const flat: TruckImageData[] = []
  trucks?.forEach((truck) => {
    truck.images?.forEach((image) => {
      if (!image?.truckSlug || !image.manufacturerSlug) return
      flat.push(image as TruckImageData)
    })
  })
  return flat
}

const readManufacturers = unstable_cache(
  async () => {
    const rows = await client.fetch(manufacturersQuery)
    const filtered = (rows ?? []).filter((make) => showsOnShelf({
      name: make.name ?? '',
      slug: make.slug?.current,
      featured: make.featured,
      isCatchAll: make.isCatchAll,
    }))
    return sortManufacturers(filtered as ShelfManufacturer[])
  },
  ['home-manufacturers'],
  { ...hour, tags: ['home-shelf'] },
)

const readTruckImageRows = unstable_cache(
  async () => {
    const rows = await client.fetch(allTruckImagesQuery)
    return rows ?? []
  },
  ['truck-image-rows'],
  { ...hour, tags: ['home-shelf'] },
)

async function readHomeImages() {
  return flattenImages(await readTruckImageRows() as Parameters<typeof flattenImages>[0])
}

export async function getHomePageData(): Promise<{
  manufacturers: ShelfManufacturer[]
  makerStatus: 'ready' | 'error'
  images: TruckImageData[]
}> {
  const [makers, images] = await Promise.allSettled([readManufacturers(), readHomeImages()])
  return {
    manufacturers: makers.status === 'fulfilled' ? makers.value : [],
    makerStatus: makers.status === 'fulfilled' ? 'ready' : 'error',
    images: images.status === 'fulfilled' ? images.value : [],
  }
}

export async function getGameDeck(): Promise<{ stills: GameStill[]; status: 'ready' | 'error' }> {
  try {
    const rows = await readTruckImageRows()
    return { stills: buildDeck(rows as Parameters<typeof buildDeck>[0]), status: 'ready' }
  } catch {
    return { stills: [], status: 'error' }
  }
}

const readManufacturer = unstable_cache(
  async (slug: string) => client.fetch(manufacturerBySlugQuery, { slug }) as Promise<ManufacturerRecord | null>,
  ['manufacturer-by-slug'],
  hour,
)

export const getManufacturerBySlug = cache(readManufacturer)

const readTrucksForManufacturer = unstable_cache(
  async (manufacturerId: string) => {
    return ([...(await client.fetch(truckModelsByManufacturerQuery, { manufacturerId })) ?? []] as ManufacturerTruckRecord[]).sort(
      compareTrucksByYear,
    )
  },
  ['trucks-by-manufacturer'],
  hour,
)

const readGroupedTrucks = unstable_cache(
  async (manufacturerId: string) => {
    const rows = ([...(await client.fetch(groupedTruckModelsQuery, {
      manufacturerId,
      featuredSlugs: [...FEATURED_MAKE_SLUGS],
    })) ?? []] as ManufacturerTruckRecord[]).sort(compareTrucksByYear)
    return rows
  },
  ['trucks-grouped-under-more'],
  hour,
)

export const getTrucksForManufacturer = cache(async (manufacturer: ManufacturerRecord) => {
  const grouped = isCatchAllMake({
    name: manufacturer.name,
    slug: manufacturer.slug.current,
    isCatchAll: manufacturer.isCatchAll,
  })
  if (grouped) return readGroupedTrucks(manufacturer._id)
  return readTrucksForManufacturer(manufacturer._id)
})

const readTruck = unstable_cache(
  async (slug: string) => client.fetch(truckModelBySlugQuery, { slug }) as Promise<TruckModel | null>,
  ['truck-by-slug'],
  hour,
)

export const getTruckBySlug = cache(readTruck)

const readTimeline = unstable_cache(
  async () => {
    const rows = await client.fetch(timelineQuery)
    return (rows ?? []) as TimelineTruck[]
  },
  ['timeline-trucks'],
  hour,
)

export const getTimelineTrucks = cache(readTimeline)

export const getManufacturerParams = unstable_cache(
  async () => {
    const rows = await client.fetch(manufacturerParamsQuery)
    return (rows ?? []).filter(
      (row): row is { manufacturer: string } => typeof row.manufacturer === 'string' && row.manufacturer.length > 0,
    )
  },
  ['manufacturer-params'],
  hour,
)

export const getTruckParams = unstable_cache(
  async () => {
    const rows = await client.fetch(truckParamsQuery)
    return (rows ?? []).filter(
      (row): row is { manufacturer: string; model: string } =>
        typeof row.manufacturer === 'string' &&
        row.manufacturer.length > 0 &&
        typeof row.model === 'string' &&
        row.model.length > 0,
    )
  },
  ['truck-params'],
  hour,
)
