import 'server-only'

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ScanCatalogTruck } from '@/lib/binder/scan-types'

export type ProbeWeights = {
  slugs: string[]
  /** One row per slug: dot product with the query vector plus bias, before softmax. */
  W: number[][]
  b: number[]
}

let cached: ProbeWeights | null | undefined

const PROBE_PATH = path.join(process.cwd(), 'src/lib/scan/probe.json')

function parseProbe(raw: unknown): ProbeWeights | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as { slugs?: unknown; W?: unknown; b?: unknown }
  if (!Array.isArray(record.slugs) || !Array.isArray(record.W) || !Array.isArray(record.b)) return null
  const slugs = record.slugs.filter((s): s is string => typeof s === 'string' && s.length > 0)
  if (slugs.length === 0 || slugs.length !== record.W.length || slugs.length !== record.b.length) return null
  const W: number[][] = []
  for (const row of record.W) {
    if (!Array.isArray(row)) return null
    const coeffs: number[] = []
    for (const n of row) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return null
      coeffs.push(n)
    }
    W.push(coeffs)
  }
  const b: number[] = []
  for (const n of record.b) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    b.push(n)
  }
  const dim = W[0]?.length ?? 0
  if (dim < 1 || !W.every((row) => row.length === dim)) return null
  return { slugs, W, b }
}

/** Loads probe.json once. Missing file is normal (trained after re-fingerprinting). */
export function loadProbeWeights(): ProbeWeights | null {
  if (cached !== undefined) return cached
  try {
    if (!existsSync(PROBE_PATH)) {
      cached = null
      return null
    }
    const parsed = parseProbe(JSON.parse(readFileSync(PROBE_PATH, 'utf8')))
    cached = parsed
    return parsed
  } catch {
    cached = null
    return null
  }
}

function softmax(logits: number[]): number[] {
  let max = Number.NEGATIVE_INFINITY
  for (const n of logits) if (n > max) max = n
  const exps = logits.map((n) => Math.exp(n - max))
  const sum = exps.reduce((a, n) => a + n, 0)
  if (!(sum > 0) || !Number.isFinite(sum)) return logits.map(() => 0)
  return exps.map((n) => n / sum)
}

export function probeTruckScores(
  vector: Float32Array,
  probe: ProbeWeights,
  catalog: ScanCatalogTruck[],
): Array<{ truckId: string; truckSlug: string; score: number }> {
  if (vector.length !== probe.W[0]?.length) return []
  const bySlug = new Map(catalog.map((truck) => [truck.slug, truck]))
  const logits: number[] = []
  for (let i = 0; i < probe.slugs.length; i += 1) {
    const row = probe.W[i]
    let dot = probe.b[i] ?? 0
    for (let j = 0; j < vector.length; j += 1) dot += row[j] * vector[j]
    logits.push(dot)
  }
  const probs = softmax(logits)
  const ranked: Array<{ truckId: string; truckSlug: string; score: number }> = []
  for (let i = 0; i < probe.slugs.length; i += 1) {
    const truck = bySlug.get(probe.slugs[i])
    if (!truck) continue
    ranked.push({ truckId: truck.id, truckSlug: truck.slug, score: probs[i] })
  }
  ranked.sort((a, b) => b.score - a.score || a.truckId.localeCompare(b.truckId))
  return ranked.slice(0, 3)
}
