-- Coarse "last did something" timestamp for admin support (login, gifts, buys, profile/colors).

alter table users
  add column if not exists last_active_at timestamptz;

update users u
set last_active_at = s.last_active
from (
  select
    u2.id,
    greatest(
      u2.created_at,
      u2.profile_modified_at,
      (select max(s.created_at) from sessions s where s.user_id = u2.id),
      (select max(i.created_at) from items i where i.created_by = u2.id),
      (select max(i.updated_at) from items i where i.created_by = u2.id),
      (select max(i.deleted_at) from items i where i.created_by = u2.id),
      (select max(p.created_at) from purchases p where p.buyer_user_id = u2.id),
      (
        select max(ph.updated_at)
        from user_profile_photos ph
        where ph.user_id = u2.id
      )
    ) as last_active
  from users u2
) s
where u.id = s.id
  and (u.last_active_at is null or u.last_active_at < s.last_active);

create index if not exists users_last_active_at_idx
  on users (last_active_at desc nulls last);
