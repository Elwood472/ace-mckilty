-- Per-user UI colors (empty string = site default).

alter table users
  add column if not exists theme_accent text not null default '',
  add column if not exists theme_page text not null default '',
  add column if not exists theme_link text not null default '';
