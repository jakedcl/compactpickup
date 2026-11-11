/**
 * Scanner fingerprints. SigLIP2-base in the browser; legacy CLIP column kept in Postgres.
 *
 * Active model: onnx-community/siglip2-base-patch16-224-ONNX (q4), 768-d, pooler_output, cosine.
 * Browser weights: src/lib/clip/browser.ts
 * Column: photos.embedding_siglip (db/migrations/006_embedding_siglip.sql)
 *
 * Legacy CLIP ViT-B/32: 512-d in photos.embedding (rollback only).
 * The public scanner embeds on the device and sends only the vector.
 * Match rows where status = 'approved' and embedding_siglip is not null.
 */

export const CLIP_MODEL = 'openai/clip-vit-base-patch32'
/** @deprecated Legacy column only. Scanner uses {@link SCAN_EMBEDDING_DIM}. */
export const CLIP_EMBEDDING_DIM = 512

export const SIGLIP_MODEL = 'onnx-community/siglip2-base-patch16-224-ONNX'
export const SCAN_EMBEDDING_DIM = 768
/** Alias used in tooling and the browser export. */
export const SIGLIP_EMBEDDING_DIM = SCAN_EMBEDDING_DIM

/** L2-normalize a fingerprint. Rejects the wrong shape, NaN, and the zero vector. */
export function l2Normalize(
  value: unknown,
  dim: number = SCAN_EMBEDDING_DIM,
): Float32Array | null {
  const source = value instanceof Float32Array ? value : Array.isArray(value) ? value : null
  if (!source || source.length !== dim) return null
  const out = new Float32Array(dim)
  let sum = 0
  for (let i = 0; i < dim; i += 1) {
    const n = source[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out[i] = n
    if (!Number.isFinite(out[i])) return null
    sum += out[i] * out[i]
  }
  if (!(sum > 0) || !Number.isFinite(sum)) return null
  const inv = 1 / Math.sqrt(sum)
  if (!Number.isFinite(inv)) return null
  for (let i = 0; i < dim; i += 1) {
    out[i] *= inv
    if (!Number.isFinite(out[i])) return null
  }
  return out
}

export function isStaleClipFingerprint(value: unknown): boolean {
  return Array.isArray(value) && value.length === CLIP_EMBEDDING_DIM
}
