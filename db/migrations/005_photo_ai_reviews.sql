-- Offline vision review notes keyed by binder photo id. The site never calls the model.

create table if not exists photo_ai_reviews (
  photo_id uuid primary key references photos (id) on delete cascade,
  outcome text not null check (outcome in ('looks_right', 'reject', 'wrong_truck', 'needs_jake')),
  suggested_truck_slug text,
  angle text,
  confidence numeric,
  reasons jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  reject_reason text,
  generation_years_guess text,
  model text,
  reviewed_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists photo_ai_reviews_outcome_idx on photo_ai_reviews (outcome);
create index if not exists photo_ai_reviews_confidence_idx on photo_ai_reviews (confidence desc nulls last);
