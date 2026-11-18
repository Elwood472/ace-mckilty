import { sql } from "./db";

export async function isListOwner(
  listId: string,
  userId: string,
): Promise<boolean> {
  const rows = await sql(
    "select 1 from wish_list_owners where list_id = $1 and user_id = $2",
    [listId, userId],
  );
  return rows.length > 0;
}

export async function getListOwnerIds(listId: string): Promise<string[]> {
  const rows = await sql<{ user_id: string }>(
    "select user_id from wish_list_owners where list_id = $1",
    [listId],
  );
  return rows.map((r) => r.user_id);
}

export async function requireListOwner(
  listId: string,
  userId: string,
): Promise<void> {
  if (!(await isListOwner(listId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

/** Owner or granted viewer. */
export async function canViewList(
  listId: string,
  userId: string,
): Promise<boolean> {
  if (await isListOwner(listId, userId)) return true;
  const rows = await sql(
    "select 1 from list_access where list_id = $1 and user_id = $2",
    [listId, userId],
  );
  return rows.length > 0;
}

export async function requireListViewer(
  listId: string,
  userId: string,
): Promise<void> {
  if (!(await canViewList(listId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

export async function grantListAccess(
  listId: string,
  userId: string,
  grantedBy: string | null,
): Promise<void> {
  await sql(
    `insert into list_access (list_id, user_id, granted_by)
     values ($1, $2, $3)
     on conflict do nothing`,
    [listId, userId, grantedBy],
  );
}

/** Keep only users who already have list_access on this list. */
export async function filterListAccessViewerIds(
  listId: string,
  viewerIds: string[],
): Promise<string[]> {
  const unique = [...new Set(viewerIds.filter((id) => id.length > 0))];
  if (!unique.length) return [];
  const rows = await sql<{ user_id: string }>(
    `select user_id from list_access
     where list_id = $1 and user_id = any($2::uuid[])`,
    [listId, unique],
  );
  return rows.map((r) => r.user_id);
}
