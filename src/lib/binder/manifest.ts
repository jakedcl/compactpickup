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

function requiredText(row: Record<string, unknown>, key: string, max: number): string {
  const value = optionalText(row[key], max)
  if (!value) throw new Error(`${key} is required`)
  return value
}

export function parseManifestLine(line: string): ManifestRow {
  const parsed = JSON.parse(line) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected an object')
  }
  const row = parsed as Record<string, unknown>
  const source = requiredText(row, 'source', 40)
  if (!isPhotoSource(source)) throw new Error(`unknown source ${source}`)
  const localPath = requiredText(row, 'localPath', 500)
  if (path.isAbsolute(localPath) || localPath.split(/[/\\]/).includes('..')) {
    throw new Error('localPath must stay inside the folder')
  }
  return {
    slug: requiredText(row, 'slug', 120),
    truckId: requiredText(row, 'truckId', 200),
    source,
    sourceUrl: optionalText(row.sourceUrl, 2000),
    originalUrl: optionalText(row.originalUrl, 2000),
    author: optionalText(row.author, 500),
    license: optionalText(row.license, 500),
    title: optionalText(row.title, 500),
    localPath,
  }
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
