-- One-time post-import password recovery controls.
create table if not exists recover_password_lock (
  id boolean primary key default true check (id),
  locked_at timestamptz not null default now()
);

create table if not exists recover_password_resets (
  email text primary key,
  reset_at timestamptz not null default now()
);
