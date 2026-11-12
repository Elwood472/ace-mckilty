create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on sessions(user_id);
create index sessions_expires_at_idx on sessions(expires_at);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete restrict,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index groups_owner_id_idx on groups(owner_id);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on group_members(user_id);

create table group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  email text,
  token text not null unique,
  invited_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create index group_invites_group_id_idx on group_invites(group_id);
create index group_invites_email_idx on group_invites(email);

create table wish_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  list_type text not null check (list_type in ('personal', 'together')),
  created_at timestamptz not null default now()
);

create index wish_lists_group_id_idx on wish_lists(group_id);

create table wish_list_owners (
  list_id uuid not null references wish_lists(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (list_id, user_id)
);

create index wish_list_owners_user_id_idx on wish_list_owners(user_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references wish_lists(id) on delete cascade,
  title text not null,
  notes text not null default '',
  url text not null default '',
  price numeric(12, 2),
  category text not null default '',
  quantity integer,
  image_url text not null default '',
  display_date date,
  restricted boolean not null default false,
  created_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity is null or quantity >= 1)
);

create index items_list_id_idx on items(list_id);
create index items_category_idx on items(category);
create index items_price_idx on items(price);

create table item_viewers (
  item_id uuid not null references items(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (item_id, user_id)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  buyer_user_id uuid not null references users(id) on delete cascade,
  quantity integer not null check (quantity >= 1),
  created_at timestamptz not null default now()
);

create index purchases_item_id_idx on purchases(item_id);
create index purchases_buyer_user_id_idx on purchases(buyer_user_id);

create table budgets (
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (user_id, group_id)
);

create table auth_rate_limits (
  key text primary key,
  hits integer not null default 0,
  window_start timestamptz not null default now()
);
