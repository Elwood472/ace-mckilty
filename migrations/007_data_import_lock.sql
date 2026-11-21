-- Permanent one-shot import lock. Survives user wipes; never truncate this table
-- from application import paths.
create table if not exists data_import_lock (
  id boolean primary key default true check (id),
  locked_at timestamptz not null default now()
);
