-- SigLIP2-base fingerprints (768-d). CLIP embedding column kept for rollback.
-- Public scan and binder queue read embedding_siglip once re-fingerprinted.

alter table photos add column if not exists embedding_siglip vector(768);

create index if not exists photos_embedding_siglip_hnsw_idx
  on photos using hnsw (embedding_siglip vector_cosine_ops);

create index if not exists photos_approved_embedding_siglip_hnsw_idx
  on photos using hnsw (embedding_siglip vector_cosine_ops)
  where status = 'approved';

comment on column photos.embedding_siglip is
  'SigLIP2-base image fingerprint (onnx-community/siglip2-base-patch16-224-ONNX, q4, 768 dims, cosine). Null until fingerprinted in the binder.';
