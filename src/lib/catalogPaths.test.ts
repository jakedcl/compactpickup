import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  adoptFreshCatalogPaths,
  canBypassCatalogPathCache,
  catalogPathKind,
  catalogPathLooksValid,
  getCatalogPathSet,
  markCatalogPathCacheBypass,
  pathsFromCatalogRows,
  resetCatalogPathCacheForTests,
  setCatalogPathReadersForTests,
  shouldRewriteUnknownCatalogPath,
  CATALOG_PATH_BYPASS_COOLDOWN_MS,
} from '@/lib/catalogPaths'

test('pathsFromCatalogRows builds maker and truck paths', () => {
  const paths = pathsFromCatalogRows(
    [{ manufacturer: 'toyota' }],
    [{ manufacturer: 'toyota', model: 'hilux' }],
  )
  assert.equal(paths.has('/toyota'), true)
  assert.equal(paths.has('/toyota/hilux'), true)
})

test('adoptFreshCatalogPaths never stores an empty list', () => {
  const prior = {
    paths: new Set(['/toyota']),
    loadedAt: 1,
  }
  const empty = adoptFreshCatalogPaths(new Set(), prior)
  assert.equal(empty.cache, prior)
  assert.deepEqual([...empty.paths!], ['/toyota'])

  const none = adoptFreshCatalogPaths(new Set(), null)
  assert.equal(none.cache, null)
  assert.equal(none.paths, null)
})

test('getCatalogPathSet returns null on throw and does not drop a good cache', async () => {
  resetCatalogPathCacheForTests()
  setCatalogPathReadersForTests({
    getManufacturerParams: async () => [{ manufacturer: 'toyota' }],
    getTruckParams: async () => [],
  })
  const loaded = await getCatalogPathSet()
  assert.equal(loaded?.has('/toyota'), true)

  setCatalogPathReadersForTests({
    getManufacturerParams: async () => {
      throw new Error('sanity down')
    },
    getTruckParams: async () => [],
  })
  const failed = await getCatalogPathSet({ bypassCache: true })
  assert.equal(failed?.has('/toyota'), true)
})

test('getCatalogPathSet returns null when fetch is empty and no prior cache', async () => {
  resetCatalogPathCacheForTests()
  setCatalogPathReadersForTests({
    getManufacturerParams: async () => [],
    getTruckParams: async () => [],
  })
  const paths = await getCatalogPathSet()
  assert.equal(paths, null)
  resetCatalogPathCacheForTests()
})

test('shouldRewriteUnknownCatalogPath fails open when lookup returns null', async () => {
  const rewrite = await shouldRewriteUnknownCatalogPath('/unknown', async () => null)
  assert.equal(rewrite, false)
})

test('shouldRewriteUnknownCatalogPath refreshes once and accepts a newly published slug', async () => {
  const base = new Set(['/toyota'])
  let bypass = false
  const refreshed = new Set(['/toyota', '/toyota/new-truck'])

  const rewrite = await shouldRewriteUnknownCatalogPath(
    '/toyota/new-truck',
    async (bypassCache) => (bypassCache ? refreshed : base),
    {
      allowed: () => true,
      markUsed: () => {
        bypass = true
      },
    },
  )

  assert.equal(bypass, true)
  assert.equal(rewrite, false)
})

test('shouldRewriteUnknownCatalogPath still 404s after refresh miss', async () => {
  const base = new Set(['/toyota'])
  const rewrite = await shouldRewriteUnknownCatalogPath(
    '/fake-maker',
    async () => base,
    {
      allowed: () => true,
      markUsed: () => {},
    },
  )
  assert.equal(rewrite, true)
})

test('catalog bypass cooldown is one refresh per 60s', () => {
  resetCatalogPathCacheForTests()
  const now = 1_700_000_000_000
  assert.equal(canBypassCatalogPathCache(now), true)
  markCatalogPathCacheBypass(now)
  assert.equal(canBypassCatalogPathCache(now + 1), false)
  assert.equal(canBypassCatalogPathCache(now + CATALOG_PATH_BYPASS_COOLDOWN_MS), true)
})

test('catalogPathKind ignores reserved roots and flags deep paths', () => {
  assert.equal(catalogPathKind('/browse'), 'none')
  assert.equal(catalogPathKind('/catalog-miss'), 'none')
  assert.equal(catalogPathKind('/toyota'), 'maker')
  assert.equal(catalogPathKind('/a/b/c'), 'deep')
  assert.equal(catalogPathLooksValid('/a/b/c', new Set(['/a/b'])), false)
})