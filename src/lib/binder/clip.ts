/**
 * Later matching uses OpenAI CLIP ViT-B/32 image embeddings.
 * No fine-tuning and no paid vision API.
 *
 * Model: openai/clip-vit-base-patch32
 * Dimension: 512 (must match photos.embedding in db/migrations/001_binder.sql)
 * Distance: cosine. The HNSW index uses vector_cosine_ops (`<=>`).
 *
 * Embeddings stay null until a later phase writes them.
 * Query approved photos only. Face tags are labels, not features.
 *
 *   select id, truck_id, truck_slug
 *   from photos
 *   where status = 'approved' and embedding is not null
 *   order by embedding <=> $1
 *   limit 5;
 */
export const CLIP_MODEL = 'openai/clip-vit-base-patch32'
export const CLIP_EMBEDDING_DIM = 512
