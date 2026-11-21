-- Fresh one-shot lock so a new publish can apply BOOTSTRAP_PASSWORD once
-- even if an earlier attempt left the v1 lock without a usable password.
create table if not exists password_bootstrap_v2_lock (
  id boolean primary key default true check (id),
  locked_at timestamptz not null default now()
);
