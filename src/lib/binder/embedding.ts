import { CLIP_EMBEDDING_DIM } from '@/lib/binder/clip'

/** Accept a 512-d finite vector and return a unit vector. Anything else is rejected. */
export function normalizeEmbedding(value: unknown): Float32Array | null {
  if (!Array.isArray(value) || value.length !== CLIP_EMBEDDING_DIM) return null
  const out = new Float32Array(CLIP_EMBEDDING_DIM)
  let sum = 0
  for (let i = 0; i < CLIP_EMBEDDING_DIM; i += 1) {
    const n = value[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out[i] = n
    sum += n * n
  }
  if (!(sum > 0)) return null
  const norm = Math.sqrt(sum)
  for (let i = 0; i < CLIP_EMBEDDING_DIM; i += 1) out[i] /= norm
  return out
}

/** pgvector text form. Built only from numbers that already passed normalizeEmbedding. */
export function vectorLiteral(values: Float32Array): string {
  if (values.length !== CLIP_EMBEDDING_DIM) throw new Error('embedding length')
  const parts = new Array<string>(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const n = values[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('embedding value')
    const text = n.toFixed(7)
    if (!/^-?\d+\.\d+$/.test(text)) throw new Error('embedding value')
    parts[i] = text
  }
  return `[${parts.join(',')}]`
}
