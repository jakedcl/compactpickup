import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { TruckImageData } from '@/components/ImageCarousel'
import type { ShelfManufacturer } from '@/components/TapeShelf'
import type { TimelineTruck } from '@/components/TruckTimelineCard'
import type { TruckModel } from '@/components/TruckModelView'
import { client } from '@/lib/sanityClient'
import type { SanityImageValue } from '@/lib/sanityImage'
import {
  allTruckImagesQuery,
  manufacturerBySlugQuery,
  manufacturerParamsQuery,
  manufacturersQuery,
  timelineQuery,
  truckModelBySlugQuery,
  truckModelsByManufacturerQuery,
  truckParamsQuery,
} from '@/lib/sanity'
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

function flattenImages(trucks: Array<{ images?: TruckImageData[] | null }> | null) {
  const flat: TruckImageData[] = []
  trucks?.forEach((truck) => {
    truck.images?.forEach((image) => flat.push(image))
  })
  return flat
}

const readManufacturers = unstable_cache(
  async () => {
    const rows = await client.fetch<ShelfManufacturer[] | null>(manufacturersQuery)
    return sortManufacturers(rows ?? [])
  },
  ['home-manufacturers'],
  { ...hour, tags: ['home-shelf'] },
)

const readHomeImages = unstable_cache(
  async () => {
    const rows = await client.fetch<Array<{ images?: TruckImageData[] | null }> | null>(allTruckImagesQuery)
    return flattenImages(rows)
  },
  ['home-images'],
  { ...hour, tags: ['home-shelf'] },
)

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

const readManufacturer = unstable_cache(
  async (slug: string) => client.fetch<ManufacturerRecord | null>(manufacturerBySlugQuery, { slug }),
  ['manufacturer-by-slug'],
  hour,
)

export const getManufacturerBySlug = cache(readManufacturer)

const readTrucksForManufacturer = unstable_cache(
  async (manufacturerId: string) => {
    const rows = await client.fetch<ManufacturerTruckRecord[] | null>(truckModelsByManufacturerQuery, { manufacturerId })
    return [...(rows ?? [])].sort(compareTrucksByYear)
  },
  ['trucks-by-manufacturer'],
  hour,
)

export const getTrucksForManufacturer = cache(readTrucksForManufacturer)

const readTruck = unstable_cache(
  async (slug: string) => client.fetch<TruckModel | null>(truckModelBySlugQuery, { slug }),
  ['truck-by-slug'],
  hour,
)

export const getTruckBySlug = cache(readTruck)

const readTimeline = unstable_cache(
  async () => {
    const rows = await client.fetch<TimelineTruck[] | null>(timelineQuery)
    return rows ?? []
  },
  ['timeline-trucks'],
  hour,
)

export const getTimelineTrucks = cache(readTimeline)

export const getManufacturerParams = unstable_cache(
  async () => {
    const rows = await client.fetch<Array<{ manufacturer: string }> | null>(manufacturerParamsQuery)
    return (rows ?? []).filter((row) => row.manufacturer)
  },
  ['manufacturer-params'],
  hour,
)

export const getTruckParams = unstable_cache(
  async () => {
    const rows = await client.fetch<Array<{ manufacturer: string; model: string }> | null>(truckParamsQuery)
    return (rows ?? []).filter((row) => row.manufacturer && row.model)
  },
  ['truck-params'],
  hour,
)
