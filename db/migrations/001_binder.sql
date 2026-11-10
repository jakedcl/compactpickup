-- Binder photo library. Re-runnable (IF NOT EXISTS).
-- Sanity stays the truck catalog: truck_id is a truckModel _id, truck_slug is slug.current.
-- The scanner and dashboard do not read the Sanity CDN. Bytes live in private R2.
-- embedding is OpenAI CLIP ViT-B/32 (openai/clip-vit-base-patch32): 512 dimensions, cosine.
-- Leave it null until a later phase fills it. Nearest neighbor reads status = 'approved' only.
-- face_tag_id is an optional coverage label. It never affects matching.
-- sha256 is the original file bytes, for dedupe. R2 stores one compressed WebP, not the original.

create extension if not exists vector;

create table if not exists truck_faces (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null,
  truck_slug text not null,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (truck_id, label)
);

create index if not exists truck_faces_truck_id_idx on truck_faces (truck_id);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null,
  truck_slug text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  angle text check (angle is null or angle in ('front', 'front-3q', 'side', 'rear-3q', 'rear', 'other')),
  face_tag_id uuid references truck_faces (id) on delete set null,
  source text not null check (source in ('sanity', 'commons', 'flickr', 'search', 'jake-upload', 'visitor')),
  source_url text,
  author text,
  license text,
  r2_key text not null check (length(r2_key) > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  embedding vector(512),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notes text,
  unique (sha256)
);

create index if not exists photos_status_idx on photos (status);
create index if not exists photos_truck_id_idx on photos (truck_id);
create index if not exists photos_truck_slug_idx on photos (truck_slug);
create index if not exists photos_face_tag_id_idx on photos (face_tag_id);
create index if not exists photos_embedding_hnsw_idx
  on photos using hnsw (embedding vector_cosine_ops);

create table if not exists login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists login_codes_email_created_idx
  on login_codes (email, created_at desc);

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text,
  ip text,
  kind text not null check (kind in ('request', 'verify')),
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_kind_created_idx
  on login_attempts (email, kind, created_at desc);

create index if not exists login_attempts_ip_kind_created_idx
  on login_attempts (ip, kind, created_at desc);

comment on column photos.embedding is
  'CLIP ViT-B/32, 512-d, cosine. Null until computed. Match approved rows only.';

comment on column photos.face_tag_id is
  'Optional truck_faces label. Never an input to matching.';

comment on column photos.sha256 is
  'SHA-256 of the original bytes. The stored object is one WebP.';
