alter table users add column birthday date;
alter table users add column profile_modified_at timestamptz;
alter table users add column picture_url text not null default '';
alter table users add column caption text not null default '';
alter table users add column height text not null default '';
alter table users add column shoe_size text not null default '';
alter table users add column pants_size text not null default '';
alter table users add column shirt_size text not null default '';
alter table users add column favorite_color text not null default '';
alter table users add column favorite_quote text not null default '';
alter table users add column heroes text not null default '';
alter table users add column wishes text not null default '';
alter table users add column favorite_food text not null default '';
alter table users add column favorite_movie text not null default '';
alter table users add column notes text not null default '';

alter table items add column deleted boolean not null default false;
alter table items add column deleted_at timestamptz;
alter table items add column user_purged boolean not null default false;
alter table items add column purchaser_purged boolean not null default false;

create table couples (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_a_id uuid not null references users(id) on delete cascade,
  user_b_id uuid not null references users(id) on delete cascade,
  label text not null,
  anniversary date,
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id)
);

create index couples_group_id_idx on couples(group_id);
create unique index couples_pair_idx on couples(group_id, user_a_id, user_b_id);
