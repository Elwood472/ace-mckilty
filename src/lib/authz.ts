import { sql } from "./db";

export type ListAccessRole = "viewer" | "editor";

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

/** Access row role for a non-owner; null if no list_access. */
export async function getGrantedListRole(
  listId: string,
  userId: string,
): Promise<ListAccessRole | null> {
  const rows = await sql<{ role: string }>(
    "select role from list_access where list_id = $1 and user_id = $2",
    [listId, userId],
  );
  if (!rows.length) return null;
  return rows[0].role === "editor" ? "editor" : "viewer";
}

/** Owner or granted viewer/editor. */
export async function canViewList(
  listId: string,
  userId: string,
): Promise<boolean> {
  if (await isListOwner(listId, userId)) return true;
  return (await getGrantedListRole(listId, userId)) != null;
}

export async function requireListViewer(
  listId: string,
  userId: string,
): Promise<void> {
  if (!(await canViewList(listId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

/** Owner or list_access.role = editor — can add/edit/remove gifts. */
export async function canEditListItems(
  listId: string,
  userId: string,
): Promise<boolean> {
  if (await isListOwner(listId, userId)) return true;
  return (await getGrantedListRole(listId, userId)) === "editor";
}

export async function requireCanEditListItems(
  listId: string,
  userId: string,
): Promise<void> {
  if (!(await canEditListItems(listId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Owner or editor — must not see purchase / taken state on this list.
 * (Editors help manage gifts without learning who bought what.)
 */
export async function hidesPurchaseSpoilers(
  listId: string,
  userId: string,
): Promise<boolean> {
  return canEditListItems(listId, userId);
}

export async function grantListAccess(
  listId: string,
  userId: string,
  grantedBy: string | null,
  role: ListAccessRole = "viewer",
): Promise<void> {
  const safeRole: ListAccessRole = role === "editor" ? "editor" : "viewer";
  await sql(
    `insert into list_access (list_id, user_id, granted_by, role)
     values ($1, $2, $3, $4)
     on conflict (list_id, user_id) do nothing`,
    [listId, userId, grantedBy, safeRole],
  );
}

export async function setListAccessRole(
  listId: string,
  userId: string,
  role: ListAccessRole,
): Promise<boolean> {
  const safeRole: ListAccessRole = role === "editor" ? "editor" : "viewer";
  const rows = await sql(
    `update list_access set role = $3
     where list_id = $1 and user_id = $2
     returning 1`,
    [listId, userId, safeRole],
  );
  return rows.length > 0;
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
