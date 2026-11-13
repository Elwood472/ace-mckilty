import { sql } from "./db";

export async function ensurePersonalList(
  userId: string,
  displayName: string,
): Promise<string> {
  const existing = await sql<{ id: string }>(
    `select l.id from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     where o.user_id = $1 and l.list_type = 'personal'
     order by l.created_at asc
     limit 1`,
    [userId],
  );
  if (existing[0]) return existing[0].id;

  const list = await sql<{ id: string }>(
    `insert into wish_lists (group_id, title, list_type)
     values (null, $1, 'personal') returning id`,
    [`${displayName}'s list`],
  );
  await sql(
    `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
    [list[0].id, userId],
  );
  return list[0].id;
}

export async function getPersonalListId(
  userId: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }>(
    `select l.id from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     where o.user_id = $1 and l.list_type = 'personal'
     order by l.created_at asc
     limit 1`,
    [userId],
  );
  return rows[0]?.id ?? null;
}

export async function getListPath(listId: string): Promise<string> {
  return `/lists/${listId}`;
}
