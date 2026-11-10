import { CLIP_EMBEDDING_DIM } from '@/lib/binder/clip'

/** pgvector text form. Built only from a vector that already passed l2Normalize. */
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
