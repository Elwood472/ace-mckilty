-- Buyer-only checklist: did I physically receive this purchased gift?
alter table purchases
  add column if not exists buyer_received boolean not null default false;
