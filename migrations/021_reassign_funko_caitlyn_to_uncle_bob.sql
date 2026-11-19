-- Support fix (one-shot): Charli Bray's "Funko POP! Caitlyn" was marked bought
-- by the wrong buyer; reassign open purchase row(s) to Uncle Bob.
-- Safe no-op if the item or Uncle Bob cannot be found uniquely.

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
  where lower(u.display_name) = lower('Charli Bray')
    and i.title ilike 'Funko POP! Caitlyn';

  if v_item_count <> 1 then
    raise notice
      'reassign funko: expected 1 matching item, found % — skipping',
      v_item_count;
    return;
  end if;

  select i.id into v_item_id
  from items i
  join wish_list_owners o on o.list_id = i.list_id
  join users u on u.id = o.user_id
  where lower(u.display_name) = lower('Charli Bray')
    and i.title ilike 'Funko POP! Caitlyn'
  limit 1;

  select count(*)::int into v_bob_count
  from users
  where lower(display_name) = lower('Uncle Bob');

  if v_bob_count <> 1 then
    raise notice
      'reassign funko: expected 1 Uncle Bob user, found % — skipping',
      v_bob_count;
    return;
  end if;

  select id into v_bob_id
  from users
  where lower(display_name) = lower('Uncle Bob')
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
