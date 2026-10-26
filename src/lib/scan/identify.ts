import 'server-only'
import type { ScanCatalogEntry, ScanIdentifyResult } from '@/lib/scan/types'
import { scanEmbeddingIndex } from '@/lib/scan/embeddingsData'
import {
  classifyEmbeddingScores,
  embeddingToMatches,
  rankByEmbedding,
} from '@/lib/scan/matchEmbeddings'
import { embedImageBytes } from '@/lib/scan/imageEmbedding'
import { identifyWithVision, visionAvailable } from '@/lib/scan/visionIdentify'

export async function identifyFromEmbeddingVector(
  vector: number[],
  catalog: ScanCatalogEntry[],
): Promise<ScanIdentifyResult> {
  const ranked = rankByEmbedding(vector, scanEmbeddingIndex, 8)
  const top = ranked[0]?.score ?? 0
  const second = ranked[1]?.score ?? 0
  const kind = classifyEmbeddingScores(top, second)
  const matches = embeddingToMatches(ranked, catalog, 3)

  if (kind === 'not_truck') {
    return {
      status: 'not_truck',
      method: 'embeddings',
      message: 'No pickup-like match in frame. Try aiming at the truck body.',
    }
  }
  if (kind === 'unknown') {
    return {
      status: 'unknown',
      method: 'embeddings',
      message: 'Could not match this to a catalog truck with enough confidence.',
      matches: matches.length ? matches : undefined,
    }
  }
  return { status: 'match', method: 'embeddings', matches }
}

export async function identifyFromImage(
  bytes: Uint8Array,
  mimeType: string,
  catalog: ScanCatalogEntry[],
): Promise<ScanIdentifyResult> {
  const vector = await embedImageBytes(bytes, mimeType)
  const ranked = rankByEmbedding(vector, scanEmbeddingIndex, 8)
  const useVision = visionAvailable()

  if (useVision) {
    const vision = await identifyWithVision(
      bytes,
      mimeType,
      catalog,
      ranked.map((r) => ({ makerSlug: r.makerSlug, modelSlug: r.modelSlug })),
    )
    if (vision.status === 'match') {
      return { status: 'match', method: 'hybrid', matches: vision.matches }
    }
    if (vision.status === 'not_truck') {
      return { status: 'not_truck', method: 'hybrid', message: vision.message }
    }
    return {
      status: vision.status,
      method: 'hybrid',
      message: vision.message,
      matches: vision.matches,
    }
  }

  return identifyFromEmbeddingVector(vector, catalog)
}
