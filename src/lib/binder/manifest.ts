import path from 'node:path'
import { isPhotoSource, type PhotoSource } from '@/lib/binder/types'

export type ManifestRow = {
  slug: string
  truckId: string
  source: PhotoSource
  sourceUrl: string | null
  originalUrl: string | null
  author: string | null
  license: string | null
  title: string | null
  localPath: string
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function firstText(row: Record<string, unknown>, keys: string[], max: number): string | null {
  for (const key of keys) {
    const value = optionalText(row[key], max)
    if (value) return value
  }
  return null
}

export function parseManifestLine(line: string, options?: { defaultSource?: PhotoSource }): ManifestRow {
  const parsed = JSON.parse(line) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected an object')
  }
  const row = parsed as Record<string, unknown>
  const sourceText = firstText(row, ['source'], 40)
  const source = sourceText ?? options?.defaultSource ?? ''
  if (!source) throw new Error('source is required')
  if (!isPhotoSource(source)) throw new Error(`unknown source ${source}`)
  const localPath = firstText(row, ['localPath', 'path', 'file', 'filename'], 500)
  if (!localPath) throw new Error('localPath is required')
  if (path.isAbsolute(localPath) || localPath.split(/[/\\]/).includes('..')) {
    throw new Error('localPath must stay inside the folder')
  }
  const slug = firstText(row, ['slug', 'truckSlug'], 120)
  if (!slug) throw new Error('slug is required')
  return {
    slug,
    truckId: firstText(row, ['truckId', 'truck_id'], 200) ?? '',
    source,
    sourceUrl: firstText(row, ['sourceUrl', 'source_url', 'url', 'sourceURL', 'pageUrl'], 2000),
    originalUrl: firstText(row, ['originalUrl', 'original_url'], 2000),
    author: firstText(row, ['author', 'artist', 'credit', 'creator'], 500),
    license: firstText(row, ['license', 'licence'], 500),
    title: firstText(row, ['title'], 500),
    localPath,
  }
}

/** Places a manifest file might live for the commons/<slug>/*.webp pull. */
export function manifestFileCandidates(
  folder: string,
  row: Pick<ManifestRow, 'slug' | 'localPath'>,
): string[] {
  const local = row.localPath.replaceAll('\\', '/')
  const base = path.posix.basename(local)
  const rels = [local]
  if (row.slug && base && base !== '.' && base !== '..') {
    rels.push(`commons/${row.slug}/${base}`)
  }
  const found: string[] = []
  for (const rel of rels) {
    try {
      found.push(resolveInside(folder, rel))
    } catch {
      // A bad relative path is skipped. resolveInside still rejects escapes.
    }
  }
  const commonsRoot = path.join(folder, 'commons')
  try {
    found.push(resolveInside(commonsRoot, local))
  } catch {
    // Same as above.
  }
  if (row.slug && base && base !== '.' && base !== '..') {
    try {
      found.push(resolveInside(commonsRoot, `${row.slug}/${base}`))
    } catch {
      // Same as above.
    }
  }
  return [...new Set(found)]
}

/**
 * The truck id always comes from the Sanity slug.
 * A truckId written in the manifest is ignored, including when it names a different truck.
 */
export function truckIdFromSlug(slug: string, bySlug: ReadonlyMap<string, string>): string | null {
  const id = bySlug.get(slug)?.trim() ?? ''
  return id.length > 0 ? id : null
}

export function resolveInside(folder: string, localPath: string): string {
  if (path.isAbsolute(localPath) || localPath.split(/[/\\]/).includes('..')) {
    throw new Error('localPath must stay inside the folder')
  }
  const root = path.resolve(folder)
  const full = path.resolve(root, localPath)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('localPath must stay inside the folder')
  }
  return full
}
