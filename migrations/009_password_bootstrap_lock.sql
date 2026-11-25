-- Build-time password bootstrap may run once when BOOTSTRAP_PASSWORD is set.
create table if not exists password_bootstrap_lock (
  id boolean primary key default true check (id),
  locked_at timestamptz not null default now()
);
