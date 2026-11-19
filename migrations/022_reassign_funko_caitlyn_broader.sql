-- Retry support fix with looser name/title matching (021 may have no-op'd).
-- Still skips unless Charli/item/Bob each resolve to exactly one row.

do $$
declare
  v_item_id uuid;
  v_bob_id uuid;
  v_item_count int;
  v_bob_count int;
  wrong record;
  v_bob_purchase uuid;
begin
  select count(*)::int into v_item_count
  from items i
  join wish_list_owners o on o.list_id = i.list_id
  join users u on u.id = o.user_id
  where u.display_name ilike '%charli%bray%'
    and i.title ilike '%funko%caitlyn%';

  if v_item_count <> 1 then
    raise notice
      'reassign funko v2: expected 1 matching item, found % — skipping',
      v_item_count;
    return;
  end if;

  select i.id into v_item_id
  from items i
  join wish_list_owners o on o.list_id = i.list_id
  join users u on u.id = o.user_id
  where u.display_name ilike '%charli%bray%'
    and i.title ilike '%funko%caitlyn%'
  limit 1;

  select count(*)::int into v_bob_count
  from users
  where display_name ilike '%uncle%bob%'
     or lower(display_name) = 'bob'
     or lower(display_name) = 'uncle bob';

  if v_bob_count <> 1 then
    raise notice
      'reassign funko v2: expected 1 Bob user, found % — use admin reassign',
      v_bob_count;
    return;
  end if;

  select id into v_bob_id
  from users
  where display_name ilike '%uncle%bob%'
     or lower(display_name) = 'bob'
     or lower(display_name) = 'uncle bob'
  limit 1;

  for wrong in
    select p.id, p.quantity
    from purchases p
    where p.item_id = v_item_id
      and p.buyer_user_id <> v_bob_id
      and p.buyer_purged = false
  loop
    select p.id into v_bob_purchase
    from purchases p
    where p.item_id = v_item_id
      and p.buyer_user_id = v_bob_id
      and p.buyer_purged = false
    limit 1;

    if v_bob_purchase is not null then
      update purchases
      set quantity = quantity + wrong.quantity
      where id = v_bob_purchase;
      delete from purchases where id = wrong.id;
    else
      update purchases
      set buyer_user_id = v_bob_id
      where id = wrong.id;
    end if;
  end loop;
end $$;
