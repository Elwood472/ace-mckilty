-- Lists are shared by invite / access request — not via friend circles.
alter table wish_lists alter column group_id drop not null;

create table list_access (
  list_id uuid not null references wish_lists(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  granted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index list_access_user_id_idx on list_access(user_id);

create table list_invites (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references wish_lists(id) on delete cascade,
  email text,
  token text not null unique,
  invited_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create index list_invites_list_id_idx on list_invites(list_id);
create index list_invites_email_idx on list_invites(email);

create table list_access_requests (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references wish_lists(id) on delete cascade,
  requester_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (list_id, requester_id)
);

create index list_access_requests_list_id_idx on list_access_requests(list_id);
create index list_access_requests_requester_id_idx on list_access_requests(requester_id);
