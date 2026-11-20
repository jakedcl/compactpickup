import type { MetadataRoute } from 'next'
import { getManufacturerParams, getTruckParams } from '@/lib/getContent'
import { SITE_ORIGIN } from '@/lib/metadata'

export const revalidate = 3600

const STATIC_PATHS = ['/', '/browse', '/timeline', '/game', '/scan'] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: path === '/' ? 1 : 0.8,
  }))

  let makers: Array<{ manufacturer: string }> = []
  let trucks: Array<{ manufacturer: string; model: string }> = []
  try {
    ;[makers, trucks] = await Promise.all([getManufacturerParams(), getTruckParams()])
  } catch {
    return staticEntries
  }

  const makerEntries: MetadataRoute.Sitemap = makers.map(({ manufacturer }) => ({
    url: `${SITE_ORIGIN}/${manufacturer}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.7,
  }))

  const truckEntries: MetadataRoute.Sitemap = trucks.map(({ manufacturer, model }) => ({
    url: `${SITE_ORIGIN}/${manufacturer}/${model}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.6,
  }))

  return [...staticEntries, ...makerEntries, ...truckEntries]
}