import { sql } from "./db";
import { daysUntil, nextOccurrence } from "./dates";

export type BuyForPerson = {
  user_id: string;
  display_name: string;
  birthday: string | null;
  profile_modified_at: string | null;
  group_id: string;
  group_name: string;
  personal_list_id: string | null;
  last_added: string | null;
  last_modified: string | null;
  last_removed: string | null;
  next_birthday: string | null;
  days_until_birthday: number | null;
};

export type CoupleRow = {
  id: string;
  group_id: string;
  group_name: string;
  label: string;
  anniversary: string | null;
  user_a_id: string;
  user_b_id: string;
  user_a_name: string;
  user_b_name: string;
  together_list_id: string | null;
  next_anniversary: string | null;
  days_until_anniversary: number | null;
};

/** Everyone you share a group with (except yourself), with activity + upcoming birthday. */
export async function listPeopleToBuyFor(
  viewerId: string,
): Promise<BuyForPerson[]> {
  const rows = await sql<{
    user_id: string;
    display_name: string;
    birthday: string | null;
    profile_modified_at: string | null;
    group_id: string;
    group_name: string;
  }>(
    `select u.id as user_id,
            u.display_name,
            u.birthday::text as birthday,
            u.profile_modified_at::text as profile_modified_at,
            g.id as group_id,
            g.name as group_name
     from group_members mine
     join group_members theirs on theirs.group_id = mine.group_id
     join users u on u.id = theirs.user_id
     join groups g on g.id = mine.group_id
     where mine.user_id = $1
       and theirs.user_id <> $1`,
    [viewerId],
  );

  // Dedupe person×group
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r.user_id}:${r.group_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const enriched: BuyForPerson[] = [];
  for (const r of unique) {
    const list = await sql<{ id: string }>(
      `select l.id from wish_lists l
       join wish_list_owners o on o.list_id = l.id
       where l.group_id = $1 and l.list_type = 'personal' and o.user_id = $2
       limit 1`,
      [r.group_id, r.user_id],
    );
    const activity = await sql<{
      last_added: string | null;
      last_modified: string | null;
      last_removed: string | null;
    }>(
      `select
         (select max(i.created_at)::text from items i
          join wish_lists l on l.id = i.list_id
          join wish_list_owners o on o.list_id = l.id
          where l.group_id = $1 and o.user_id = $2 and i.deleted = false) as last_added,
         (select max(i.updated_at)::text from items i
          join wish_lists l on l.id = i.list_id
          join wish_list_owners o on o.list_id = l.id
          where l.group_id = $1 and o.user_id = $2 and i.deleted = false) as last_modified,
         (select max(i.deleted_at)::text from items i
          join wish_lists l on l.id = i.list_id
          join wish_list_owners o on o.list_id = l.id
          where l.group_id = $1 and o.user_id = $2 and i.deleted = true) as last_removed`,
      [r.group_id, r.user_id],
    );
    const next = nextOccurrence(r.birthday);
    enriched.push({
      ...r,
      personal_list_id: list[0]?.id ?? null,
      last_added: activity[0]?.last_added ?? null,
      last_modified: activity[0]?.last_modified ?? null,
      last_removed: activity[0]?.last_removed ?? null,
      next_birthday: next ? next.toISOString().slice(0, 10) : null,
      days_until_birthday: daysUntil(r.birthday),
    });
  }

  enriched.sort((a, b) => {
    const g = a.group_name.localeCompare(b.group_name);
    if (g !== 0) return g;
    const da = a.days_until_birthday ?? 9999;
    const db = b.days_until_birthday ?? 9999;
    if (da !== db) return da - db;
    return a.display_name.localeCompare(b.display_name);
  });

  return enriched;
}

export async function listCouplesForViewer(
  viewerId: string,
): Promise<CoupleRow[]> {
  const rows = await sql<{
    id: string;
    group_id: string;
    group_name: string;
    label: string;
    anniversary: string | null;
    user_a_id: string;
    user_b_id: string;
    user_a_name: string;
    user_b_name: string;
  }>(
    `select c.id, c.group_id, g.name as group_name, c.label,
            c.anniversary::text as anniversary,
            c.user_a_id, c.user_b_id,
            a.display_name as user_a_name,
            b.display_name as user_b_name
     from couples c
     join groups g on g.id = c.group_id
     join group_members gm on gm.group_id = c.group_id and gm.user_id = $1
     join users a on a.id = c.user_a_id
     join users b on b.id = c.user_b_id
     order by g.name, c.label`,
    [viewerId],
  );

  const enriched: CoupleRow[] = [];
  for (const r of rows) {
    const list = await sql<{ id: string }>(
      `select l.id from wish_lists l
       join wish_list_owners oa on oa.list_id = l.id and oa.user_id = $2
       join wish_list_owners ob on ob.list_id = l.id and ob.user_id = $3
       where l.group_id = $1 and l.list_type = 'together'
       limit 1`,
      [r.group_id, r.user_a_id, r.user_b_id],
    );
    const next = nextOccurrence(r.anniversary);
    enriched.push({
      ...r,
      together_list_id: list[0]?.id ?? null,
      next_anniversary: next ? next.toISOString().slice(0, 10) : null,
      days_until_anniversary: daysUntil(r.anniversary),
    });
  }

  enriched.sort((a, b) => {
    const g = a.group_name.localeCompare(b.group_name);
    if (g !== 0) return g;
    const da = a.days_until_anniversary ?? 9999;
    const db = b.days_until_anniversary ?? 9999;
    if (da !== db) return da - db;
    return a.label.localeCompare(b.label);
  });

  return enriched;
}
