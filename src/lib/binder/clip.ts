/**
 * CLIP ViT-B/32 image embeddings. No fine-tuning and no paid vision API.
 *
 * Model: openai/clip-vit-base-patch32
 * Browser weights: Xenova/clip-vit-base-patch32 in src/lib/clip/browser.ts
 * Dimension: 512 (photos.embedding in db/migrations/001_binder.sql)
 * Distance: cosine. The HNSW index uses vector_cosine_ops (`<=>`).
 *
 * The public scanner embeds on the device and sends only this vector.
 * The canonical extractor is embedImage in src/lib/clip/browser.ts.
 * Match rows where status = 'approved' and embedding is not null.
 * Face tags are labels, not features. This file stays free of server-only
 * imports because the browser embedder normalizes with l2Normalize.
 */
export const CLIP_MODEL = 'openai/clip-vit-base-patch32'
export const CLIP_EMBEDDING_DIM = 512

/** L2-normalize a 512-d fingerprint. Rejects the wrong shape, NaN, and the zero vector. */
export function l2Normalize(value: unknown): Float32Array | null {
  const source = value instanceof Float32Array ? value : Array.isArray(value) ? value : null
  if (!source || source.length !== CLIP_EMBEDDING_DIM) return null
  const out = new Float32Array(CLIP_EMBEDDING_DIM)
  let sum = 0
  for (let i = 0; i < CLIP_EMBEDDING_DIM; i += 1) {
    const n = source[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out[i] = n
    if (!Number.isFinite(out[i])) return null
    sum += out[i] * out[i]
  }
  if (!(sum > 0) || !Number.isFinite(sum)) return null
  const inv = 1 / Math.sqrt(sum)
  if (!Number.isFinite(inv)) return null
  for (let i = 0; i < CLIP_EMBEDDING_DIM; i += 1) {
    out[i] *= inv
    if (!Number.isFinite(out[i])) return null
  }
  return out
}
