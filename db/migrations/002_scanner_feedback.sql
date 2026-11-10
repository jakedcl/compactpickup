-- Public scanner feedback and rate limits.
-- Re-runnable (IF NOT EXISTS). Does not approve photos and does not update photos.status.
-- A visitor photo is still a row in photos: source = 'visitor', status = 'pending', until review.
-- Rejected rows stay rejected. This migration has no update of photos.
-- ip_hash is HMAC-SHA256(AUTH_SECRET, rate-limit subject). Raw addresses are not stored.

create table if not exists scanner_feedback (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos (id) on delete set null,
  guessed_truck_id text,
  guessed_truck_slug text,
  verdict text not null check (verdict in ('right', 'wrong')),
  corrected_truck_id text,
  corrected_truck_slug text,
  consent boolean not null,
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint scanner_feedback_consent check (consent),
  constraint scanner_feedback_shape check (
    (
      verdict = 'right'
      and guessed_truck_id is not null
      and guessed_truck_slug is not null
      and corrected_truck_id is null
      and corrected_truck_slug is null
    )
    or (
      verdict = 'wrong'
      and guessed_truck_id is not null
      and guessed_truck_slug is not null
      and corrected_truck_id is not null
      and corrected_truck_slug is not null
    )
  )
);

create index if not exists scanner_feedback_photo_id_idx
  on scanner_feedback (photo_id);

create index if not exists scanner_feedback_created_idx
  on scanner_feedback (created_at desc);

-- Fixed windows. scan-site and submit-site use the hash of '*' as the shared ceiling.
create table if not exists scanner_rate_buckets (
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  route text not null check (route in ('scan', 'scan-site', 'submit', 'submit-site')),
  bucket timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (ip_hash, route, bucket)
);

-- Partial index so approved-only nearest neighbor does not walk rejected rows.
create index if not exists photos_approved_embedding_hnsw_idx
  on photos using hnsw (embedding vector_cosine_ops)
  where status = 'approved';

create index if not exists scanner_rate_buckets_bucket_idx
  on scanner_rate_buckets (bucket);

comment on table scanner_feedback is
  'Visitor right/wrong on a public scan. Inserted only with consent. Never approves a photo.';

comment on table scanner_rate_buckets is
  'Fixed-window hit counts for /api/scan and the public photo submit. Keys are HMAC hashes.';
