-- Admin support actions (allowlisted operators only).

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references users(id) on delete cascade,
  action text not null,
  target_user_id uuid references users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on admin_audit_log (created_at desc);

create index if not exists admin_audit_log_target_user_id_idx
  on admin_audit_log (target_user_id);
