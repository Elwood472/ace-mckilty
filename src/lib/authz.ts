import { sql } from "./db";

export async function isGroupMember(
  groupId: string,
  userId: string,
): Promise<boolean> {
  const rows = await sql(
    "select 1 from group_members where group_id = $1 and user_id = $2",
    [groupId, userId],
  );
  return rows.length > 0;
}

export async function requireGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  if (!(await isGroupMember(groupId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

export async function isGroupOwner(
  groupId: string,
  userId: string,
): Promise<boolean> {
  const rows = await sql(
    "select 1 from groups where id = $1 and owner_id = $2",
    [groupId, userId],
  );
  return rows.length > 0;
}

export async function requireGroupOwner(
  groupId: string,
  userId: string,
): Promise<void> {
  if (!(await isGroupOwner(groupId, userId))) {
    throw new Error("FORBIDDEN");
  }
}

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

export async function getListGroupId(listId: string): Promise<string | null> {
  const rows = await sql<{ group_id: string }>(
    "select group_id from wish_lists where id = $1",
    [listId],
  );
  return rows[0]?.group_id ?? null;
}
