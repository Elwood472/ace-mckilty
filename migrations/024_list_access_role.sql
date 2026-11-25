-- Viewer (shop) vs editor (manage gifts, no purchase spoilers).
alter table list_access
  add column if not exists role text not null default 'viewer';

alter table list_access
  drop constraint if exists list_access_role_check;

alter table list_access
  add constraint list_access_role_check
  check (role in ('viewer', 'editor'));
