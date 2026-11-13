import { sql } from "./db";
import { daysUntil, nextOccurrence } from "./dates";

export type BuyForPerson = {
  user_id: string;
  display_name: string;
  birthday: string | null;
  profile_modified_at: string | null;
  personal_list_id: string;
  last_added: string | null;
  last_modified: string | null;
  last_removed: string | null;
  next_birthday: string | null;
  days_until_birthday: number | null;
};

/** People whose personal lists you have been granted access to. */
export async function listPeopleToBuyFor(
  viewerId: string,
): Promise<BuyForPerson[]> {
  const rows = await sql<{
    user_id: string;
    display_name: string;
    birthday: string | null;
    profile_modified_at: string | null;
    personal_list_id: string;
  }>(
    `select u.id as user_id,
            u.display_name,
            u.birthday::text as birthday,
            u.profile_modified_at::text as profile_modified_at,
            l.id as personal_list_id
     from list_access a
     join wish_lists l on l.id = a.list_id and l.list_type = 'personal'
     join wish_list_owners o on o.list_id = l.id
     join users u on u.id = o.user_id
     where a.user_id = $1
       and o.user_id <> $1`,
    [viewerId],
  );

  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  });

  const enriched: BuyForPerson[] = [];
  for (const r of unique) {
    const activity = await sql<{
      last_added: string | null;
      last_modified: string | null;
      last_removed: string | null;
    }>(
      `select
         (select max(i.created_at)::text from items i
          where i.list_id = $1 and i.deleted = false) as last_added,
         (select max(i.updated_at)::text from items i
          where i.list_id = $1 and i.deleted = false) as last_modified,
         (select max(i.deleted_at)::text from items i
          where i.list_id = $1 and i.deleted = true) as last_removed`,
      [r.personal_list_id],
    );
    const next = nextOccurrence(r.birthday);
    enriched.push({
      ...r,
      last_added: activity[0]?.last_added ?? null,
      last_modified: activity[0]?.last_modified ?? null,
      last_removed: activity[0]?.last_removed ?? null,
      next_birthday: next ? next.toISOString().slice(0, 10) : null,
      days_until_birthday: daysUntil(r.birthday),
    });
  }

  enriched.sort((a, b) => {
    const da = a.days_until_birthday ?? 9999;
    const db = b.days_until_birthday ?? 9999;
    if (da !== db) return da - db;
    return a.display_name.localeCompare(b.display_name);
  });

  return enriched;
}

export type PeopleSearchHit = {
  id: string;
  display_name: string;
  email: string;
  personal_list_id: string | null;
  has_access: boolean;
  pending_request: boolean;
};

export async function searchPeople(
  viewerId: string,
  query: string,
): Promise<PeopleSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await sql<{
    id: string;
    display_name: string;
    email: string;
    personal_list_id: string | null;
    has_access: boolean;
    pending_request: boolean;
  }>(
    `select u.id, u.display_name, u.email,
            (
              select l.id from wish_lists l
              join wish_list_owners o on o.list_id = l.id
              where o.user_id = u.id and l.list_type = 'personal'
              order by l.created_at asc limit 1
            ) as personal_list_id,
            exists(
              select 1 from list_access a
              join wish_lists l on l.id = a.list_id and l.list_type = 'personal'
              join wish_list_owners o on o.list_id = l.id and o.user_id = u.id
              where a.user_id = $1
            ) as has_access,
            exists(
              select 1 from list_access_requests r
              join wish_lists l on l.id = r.list_id and l.list_type = 'personal'
              join wish_list_owners o on o.list_id = l.id and o.user_id = u.id
              where r.requester_id = $1 and r.status = 'pending'
            ) as pending_request
     from users u
     where u.id <> $1
       and (u.display_name ilike $2 or u.email ilike $2)
     order by u.display_name
     limit 20`,
    [viewerId, `%${q}%`],
  );
  return rows;
}
