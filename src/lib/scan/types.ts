export type ScanCatalogEntry = {
  id: string
  title: string
  maker: string
  makerSlug: string
  modelSlug: string
  href: string
  years: string
  generation: string | null
}

export type ScanMatch = {
  truckId: string
  maker: string
  model: string
  generation: string | null
  years: string
  href: string
  confidence: number
  reason?: string
}

export type ScanIdentifyResult =
  | {
      status: 'match'
      method: 'embeddings' | 'vision' | 'hybrid'
      matches: ScanMatch[]
    }
  | {
      status: 'not_truck'
      method: 'embeddings' | 'vision' | 'hybrid'
      message: string
    }
  | {
      status: 'unknown'
      method: 'embeddings' | 'vision' | 'hybrid'
      message: string
      matches?: ScanMatch[]
    }

export type ScanEmbeddingIndex = {
  version: 1
  model: string
  dimension: number
  builtAt: string
  trucks: Array<{
    truckId: string
    makerSlug: string
    modelSlug: string
    /** L2-normalized mean of gallery image embeddings */
    vector: number[]
    /** Per-gallery-image embeddings for max-pool matching */
    imageVectors?: number[][]
    imageCount: number
  }>
}
