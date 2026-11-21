create table if not exists user_profile_photos (
  user_id uuid primary key references users(id) on delete cascade,
  content_type text not null,
  bytes bytea not null,
  updated_at timestamptz not null default now()
);
