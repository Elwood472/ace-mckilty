alter table items add column source text not null default '';
alter table wish_lists add column anniversary date;
create unique index groups_owner_name_unique_idx
  on groups (owner_id, lower(name));
