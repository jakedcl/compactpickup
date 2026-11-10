/**
 * Matching uses CLIP ViT-B/32 image embeddings.
 * No fine-tuning and no paid vision API. The browser computes them
 * (`src/lib/clip/browser.ts`); Vercel functions only store the vector.
 *
 * Model: openai/clip-vit-base-patch32
 * Browser weights: Xenova/clip-vit-base-patch32, wasm, q8
 * Dimension: 512 (must match photos.embedding in db/migrations/001_binder.sql)
 * Distance: cosine. The HNSW index uses vector_cosine_ops (`<=>`).
 *
 * Query approved photos that already have a vector. Face tags are labels, not features.
 *
 *   select id, truck_id, truck_slug
 *   from photos
 *   where status = 'approved' and embedding is not null
 *   order by embedding <=> $1
 *   limit 5;
 */
export const CLIP_MODEL = 'openai/clip-vit-base-patch32'
export const CLIP_EMBEDDING_DIM = 512
