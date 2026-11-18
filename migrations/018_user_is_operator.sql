-- Admin capability is not granted by email match alone.
-- Open signup never sets is_operator; a one-shot grant promotes
-- existing ADMIN_EMAILS accounts, then locks further auto-grants.
alter table users
  add column if not exists is_operator boolean not null default false;

create table if not exists admin_operator_grant_lock (
  id boolean primary key default true check (id),
  locked_at timestamptz not null default now()
);
