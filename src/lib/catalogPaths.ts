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
export const CATALOG_PATH_BYPASS_COOLDOWN_MS = 60 * 1000

type PathCache = {
  paths: Set<string>
  loadedAt: number
}

type CatalogReaders = {
  getManufacturerParams: typeof getManufacturerParams
  getTruckParams: typeof getTruckParams
}

let goodCache: PathCache | null = null
let lastBypassRefreshAt = 0
let readers: CatalogReaders = { getManufacturerParams, getTruckParams }

export function pathsFromCatalogRows(
  makers: Array<{ manufacturer: string }>,
  trucks: Array<{ manufacturer: string; model: string }>,
): Set<string> {
  const paths = new Set<string>()
  for (const { manufacturer } of makers) {
    if (manufacturer) paths.add(`/${manufacturer}`)
  }
  for (const { manufacturer, model } of trucks) {
    if (manufacturer && model) paths.add(`/${manufacturer}/${model}`)
  }
  return paths
}

/** Apply a fresh Sanity list to cache; never store an empty list. */
export function adoptFreshCatalogPaths(
  fresh: Set<string>,
  prior: PathCache | null,
): { cache: PathCache | null; paths: Set<string> | null } {
  if (fresh.size === 0) return { cache: prior, paths: prior?.paths ?? null }
  const next: PathCache = { paths: fresh, loadedAt: Date.now() }
  return { cache: next, paths: fresh }
}

async function loadCatalogPathsFromSource(): Promise<Set<string> | null> {
  try {
    const [makers, trucks] = await Promise.all([readers.getManufacturerParams(), readers.getTruckParams()])
    return pathsFromCatalogRows(makers ?? [], trucks ?? [])
  } catch {
    return null
  }
}

export async function getCatalogPathSet(options?: { bypassCache?: boolean }): Promise<Set<string> | null> {
  if (!options?.bypassCache && goodCache && Date.now() - goodCache.loadedAt < CACHE_MS) {
    return goodCache.paths
  }
  const rows = await loadCatalogPathsFromSource()
  if (rows === null || rows.size === 0) return goodCache?.paths ?? null
  const adopted = adoptFreshCatalogPaths(rows, goodCache)
  goodCache = adopted.cache
  return adopted.paths
}

export function canBypassCatalogPathCache(now = Date.now()): boolean {
  return now - lastBypassRefreshAt >= CATALOG_PATH_BYPASS_COOLDOWN_MS
}

export function markCatalogPathCacheBypass(now = Date.now()): void {
  lastBypassRefreshAt = now
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

/** True when proxy should rewrite to catalog-miss (caller must fail open if paths were null). */
export async function shouldRewriteUnknownCatalogPath(
  pathname: string,
  lookup: (bypassCache: boolean) => Promise<Set<string> | null> = (bypass) => getCatalogPathSet({ bypassCache: bypass }),
  bypass = {
    allowed: canBypassCatalogPathCache,
    markUsed: markCatalogPathCacheBypass,
  },
): Promise<boolean> {
  const kind = catalogPathKind(pathname)
  if (kind === 'none') return false

  let paths = await lookup(false)
  if (paths === null) return false
  if (catalogPathLooksValid(pathname, paths)) return false

  if (bypass.allowed()) {
    bypass.markUsed()
    paths = await lookup(true)
    if (paths === null) return false
    if (catalogPathLooksValid(pathname, paths)) return false
  }

  return true
}

export function resetCatalogPathCacheForTests(): void {
  goodCache = null
  lastBypassRefreshAt = 0
  readers = { getManufacturerParams, getTruckParams }
}

export function setCatalogPathReadersForTests(next: Partial<CatalogReaders>): void {
  readers = { ...readers, ...next }
}