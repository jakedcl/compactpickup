import { getManufacturerParams, getTruckParams } from '@/lib/getContent'

const ROOT_ROUTES = new Set([
  'browse',
  'game',
  'scan',
  'timeline',
  'studio',
  'binder',
  'api',
  'catalog-miss',
])

const CACHE_MS = 60 * 60 * 1000

let cache: { paths: Set<string>; loadedAt: number } | null = null

export async function getCatalogPathSet(): Promise<Set<string>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.paths
  try {
    const [makers, trucks] = await Promise.all([getManufacturerParams(), getTruckParams()])
    const paths = new Set<string>()
    for (const { manufacturer } of makers) {
      if (manufacturer) paths.add(`/${manufacturer}`)
    }
    for (const { manufacturer, model } of trucks) {
      if (manufacturer && model) paths.add(`/${manufacturer}/${model}`)
    }
    cache = { paths, loadedAt: Date.now() }
    return paths
  } catch {
    return cache?.paths ?? new Set()
  }
}

export type CatalogPathKind = 'none' | 'maker' | 'truck' | 'deep'

export function catalogPathKind(pathname: string): CatalogPathKind {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return 'none'
  if (ROOT_ROUTES.has(parts[0])) return 'none'
  if (parts.length === 1) return 'maker'
  if (parts.length === 2) return 'truck'
  return 'deep'
}

export function catalogPathLooksValid(pathname: string, paths: Set<string>): boolean {
  const kind = catalogPathKind(pathname)
  if (kind === 'none') return true
  if (kind === 'deep') return false
  return paths.has(pathname)
}