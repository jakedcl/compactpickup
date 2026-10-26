import type { ScanCatalogEntry, ScanEmbeddingIndex, ScanMatch } from '@/lib/scan/types'

export const EMBED_MATCH_THRESHOLD = 0.2
export const EMBED_UNKNOWN_THRESHOLD = 0.26
export const EMBED_NOT_TRUCK_THRESHOLD = 0.18

function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

function l2Normalize(vector: number[]): number[] {
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm) || 1
  return vector.map((v) => v / norm)
}

export function meanVector(vectors: number[][]): number[] {
  if (!vectors.length) return []
  const dim = vectors[0].length
  const acc = new Array(dim).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += vec[i]
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length
  return l2Normalize(acc)
}

export type EmbeddingCandidate = {
  truckId: string
  makerSlug: string
  modelSlug: string
  score: number
}

function bestScoreForTruck(q: number[], row: ScanEmbeddingIndex['trucks'][number]): number {
  const refs = row.imageVectors?.length ? row.imageVectors : [row.vector]
  let best = -1
  for (const ref of refs) {
    const score = dot(q, l2Normalize(ref))
    if (score > best) best = score
  }
  return best
}

export function rankByEmbedding(
  queryVector: number[],
  index: ScanEmbeddingIndex,
  limit = 8,
): EmbeddingCandidate[] {
  const q = l2Normalize(queryVector)
  const scored: EmbeddingCandidate[] = []
  for (const row of index.trucks) {
    const score = bestScoreForTruck(q, row)
    scored.push({
      truckId: row.truckId,
      makerSlug: row.makerSlug,
      modelSlug: row.modelSlug,
      score,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export function embeddingToMatches(
  candidates: EmbeddingCandidate[],
  catalog: ScanCatalogEntry[],
  limit = 3,
): ScanMatch[] {
  const byId = new Map(catalog.map((t) => [t.id, t]))
  const matches: ScanMatch[] = []
  for (const cand of candidates) {
    const truck = byId.get(cand.truckId)
    if (!truck) continue
    const confidence = Math.max(0, Math.min(1, (cand.score - EMBED_MATCH_THRESHOLD) / (1 - EMBED_MATCH_THRESHOLD)))
    matches.push({
      truckId: truck.id,
      maker: truck.maker,
      model: truck.title,
      generation: truck.generation,
      years: truck.years,
      href: truck.href,
      confidence: Math.round(confidence * 100) / 100,
    })
    if (matches.length >= limit) break
  }
  return matches
}

export function classifyEmbeddingScores(topScore: number, secondScore: number): 'match' | 'unknown' | 'not_truck' {
  if (topScore < EMBED_NOT_TRUCK_THRESHOLD) return 'not_truck'
  if (topScore < EMBED_UNKNOWN_THRESHOLD) return 'unknown'
  if (topScore - secondScore < 0.015 && topScore < 0.32) return 'unknown'
  return 'match'
}
