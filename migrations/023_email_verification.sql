-- Signup must prove email ownership before a session is issued.
-- Existing accounts are treated as already verified.

alter table users
  add column if not exists email_verified_at timestamptz;

update users
set email_verified_at = coalesce(created_at, now())
where email_verified_at is null;

create table if not exists email_verify_tokens (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verify_tokens_user_id_idx
  on email_verify_tokens(user_id);

create index if not exists email_verify_tokens_expires_at_idx
  on email_verify_tokens(expires_at);
