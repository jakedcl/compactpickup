/**
 * Import a local folder of photos as pending binder rows.
 *
 * The folder contains manifest.jsonl (or commons/manifest.jsonl). One JSON object per line.
 * A commons pull looks like:
 *   commons/<slug>/*.webp
 *   manifest.jsonl with source URL, license, author, and title.
 * source defaults to commons when the folder has a commons/ directory and the line omits it.
 * The truck id always comes from the Sanity slug. A truckId in the manifest is ignored.
 *
 *   npm run import:folder -- ./path/to/folder
 *   BINDER_CONFIRM=1 npm run import:folder -- /workspace/cp-photo-pull
 *
 * Dry run checks that each file exists and does not upload. Writes are idempotent on sha256.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import { withDirectClient } from '../src/lib/binder/db'
import { BINDER_WRITE_ENV, requireEnvs } from '../src/lib/binder/env'
import { MAX_ORIGINAL_BYTES } from '../src/lib/binder/images'
import { manifestFileCandidates, parseManifestLine, truckIdFromSlug, type ManifestRow } from '../src/lib/binder/manifest'
import { storeOriginalPhoto } from '../src/lib/binder/store-photo'
import { apiVersion, dataset, projectId } from '../src/lib/sanityConfig'

function notesFor(title: string | null, sourceUrl: string | null, originalUrl: string | null): string | null {
  const parts: string[] = []
  if (title) parts.push(title)
  if (originalUrl && originalUrl !== sourceUrl) parts.push(originalUrl)
  if (parts.length === 0) return null
  return parts.join(' — ').slice(0, 2000)
}

async function readManifest(folder: string): Promise<string> {
  const root = path.join(folder, 'manifest.jsonl')
  try {
    return await readFile(root, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
    if (code !== 'ENOENT') throw error
  }
  return readFile(path.join(folder, 'commons', 'manifest.jsonl'), 'utf8')
}

async function locateFile(folder: string, row: ManifestRow): Promise<string | null> {
  for (const candidate of manifestFileCandidates(folder, row)) {
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile()) return candidate
  }
  return null
}

async function truckIdsBySlug(slugs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(slugs)]
  const found = new Map<string, string>()
  if (unique.length === 0) return found
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const rows = await client.fetch<Array<{ _id: string; slug: string }>>(
    `*[_type == "truckModel" && slug.current in $slugs && !(_id in path("drafts.**"))]{
      _id, "slug": slug.current
    }`,
    { slugs: unique },
  )
  for (const row of rows) {
    if (row.slug && row._id && !found.has(row.slug)) found.set(row.slug, row._id)
  }
  return found
}

async function main() {
  const folderArg = process.argv[2]
  if (!folderArg) {
    console.error('Usage: npm run import:folder -- ./path/to/folder')
    process.exit(1)
  }
  const folder = path.resolve(folderArg)
  let raw: string
  try {
    raw = await readManifest(folder)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
    if (code === 'ENOENT') console.error('manifest.jsonl was not found in the folder or in commons/')
    else console.error('folder import failed (Error)')
    process.exit(1)
  }
  const commonsDir = await stat(path.join(folder, 'commons'))
    .then((info) => info.isDirectory())
    .catch(() => false)
  const lines = raw.split('\n')
  let listed = 0
  let missing = 0
  const rows: Array<{ line: number; row: ManifestRow; file: string }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    listed += 1
    try {
      const row = parseManifestLine(line, commonsDir ? { defaultSource: 'commons' } : undefined)
      const file = await locateFile(folder, row)
      if (!file) {
        missing += 1
        console.log(`missing line ${index + 1} ${row.localPath}`)
        continue
      }
      const info = await stat(file)
      if (info.size > MAX_ORIGINAL_BYTES) {
        missing += 1
        console.log(`fail line ${index + 1} image too large`)
        continue
      }
      rows.push({ line: index + 1, row, file })
      console.log(`ready line ${index + 1} ${row.slug} ${row.source} ${row.localPath}`)
    } catch (error) {
      missing += 1
      const name = error instanceof Error ? error.message : 'bad line'
      console.log(`fail line ${index + 1} ${name}`)
    }
  }

  const lookup = await truckIdsBySlug(rows.map((item) => item.row.slug))
  for (const item of rows) {
    const truckId = truckIdFromSlug(item.row.slug, lookup)
    if (!truckId) {
      missing += 1
      item.row.truckId = ''
      console.log(`fail line ${item.line} unknown slug ${item.row.slug}`)
      continue
    }
    if (item.row.truckId && item.row.truckId !== truckId) {
      console.log(`line ${item.line} slug ${item.row.slug} replaces the manifest truck id`)
    }
    item.row.truckId = truckId
  }

  const ready = rows.filter((item) => item.row.truckId)
  console.log(`${listed} lines, ${ready.length} files ready, ${missing} problems`)
  if (!writesEnabled()) {
    console.log('Dry run. Set BINDER_CONFIRM=1 to compress, upload, and insert pending rows.')
    if (missing > 0) process.exit(1)
    return
  }
  if (missing > 0) process.exit(1)

  requireEnvs(BINDER_WRITE_ENV)

  let inserted = 0
  let skipped = 0
  let failed = 0
  await withDirectClient(async (db) => {
    for (const item of ready) {
      try {
        const original = await readFile(item.file)
        const outcome = await storeOriginalPhoto(db, {
          original,
          truckId: item.row.truckId,
          truckSlug: item.row.slug,
          source: item.row.source,
          sourceUrl: item.row.sourceUrl ?? item.row.originalUrl,
          author: item.row.author,
          license: item.row.license,
          notes: notesFor(item.row.title, item.row.sourceUrl, item.row.originalUrl),
        })
        if (outcome === 'inserted') inserted += 1
        else skipped += 1
        console.log(`${outcome} line ${item.line} ${item.row.slug}`)
      } catch (error) {
        failed += 1
        const name = error instanceof Error ? error.name : 'Error'
        console.log(`fail line ${item.line} ${name}`)
      }
    }
  })
  console.log(`inserted ${inserted}, skipped ${skipped}, failed ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`folder import failed (${name})`)
  process.exit(1)
})
