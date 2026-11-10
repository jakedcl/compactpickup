/**
 * Import a local folder of photos as pending binder rows.
 *
 * The folder contains manifest.jsonl. One JSON object per line:
 * {"slug":"b-5","truckId":"<sanity _id>","source":"commons","sourceUrl":"","originalUrl":"","author":"","license":"","title":"","localPath":"a.jpg"}
 *
 * localPath is relative to the folder. source is sanity|commons|flickr|search|jake-upload|visitor.
 *
 *   npm run import:folder -- ./path/to/folder
 *   BINDER_CONFIRM=1 npm run import:folder -- ./path/to/folder
 *
 * Dry run checks that each file exists and does not upload. Writes are idempotent on sha256.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { writesEnabled } from '../src/lib/binder/confirm'
import { withDirectClient } from '../src/lib/binder/db'
import { BINDER_WRITE_ENV, requireEnvs } from '../src/lib/binder/env'
import { MAX_ORIGINAL_BYTES } from '../src/lib/binder/images'
import { parseManifestLine, resolveInside } from '../src/lib/binder/manifest'
import { storeOriginalPhoto } from '../src/lib/binder/store-photo'

function notesFor(title: string | null, sourceUrl: string | null, originalUrl: string | null): string | null {
  const parts: string[] = []
  if (title) parts.push(title)
  if (originalUrl && originalUrl !== sourceUrl) parts.push(originalUrl)
  if (parts.length === 0) return null
  return parts.join(' — ').slice(0, 2000)
}

async function main() {
  const folderArg = process.argv[2]
  if (!folderArg) {
    console.error('Usage: npm run import:folder -- ./path/to/folder')
    process.exit(1)
  }
  const folder = path.resolve(folderArg)
  const raw = await readFile(path.join(folder, 'manifest.jsonl'), 'utf8')
  const lines = raw.split('\n')
  let listed = 0
  let missing = 0
  const rows: Array<{ line: number; row: ReturnType<typeof parseManifestLine>; file: string }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    listed += 1
    try {
      const row = parseManifestLine(line)
      const file = resolveInside(folder, row.localPath)
      const info = await stat(file).catch(() => null)
      if (!info?.isFile()) {
        missing += 1
        console.log(`missing line ${index + 1} ${row.localPath}`)
        continue
      }
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

  console.log(`${listed} lines, ${rows.length} files ready, ${missing} problems`)
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
    for (const item of rows) {
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
