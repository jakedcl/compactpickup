-- Drop the legacy CLIP ViT-B/32 fingerprints (512-d). The scanner and binder use
-- embedding_siglip only (006). Run after the code that stopped writing photos.embedding is live.

drop index if exists photos_approved_embedding_hnsw_idx;
drop index if exists photos_embedding_hnsw_idx;
alter table photos drop column if exists embedding;
