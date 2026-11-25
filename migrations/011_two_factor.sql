-- Optional two-factor: authenticator (TOTP) and/or email codes.

alter table users
  add column if not exists totp_secret text,
  add column if not exists totp_enabled boolean not null default false,
  add column if not exists email_2fa_enabled boolean not null default false;

-- Short-lived post-password login challenges (cookie gr_2fa).
create table if not exists auth_challenges (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  next_path text not null default '/dashboard',
  email_code_hash text,
  email_sent_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_user_id_idx on auth_challenges(user_id);
create index if not exists auth_challenges_expires_at_idx on auth_challenges(expires_at);

-- Pending authenticator setup before the user confirms a code.
create table if not exists totp_setup (
  user_id uuid primary key references users(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now()
);
