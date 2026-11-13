"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import { requireGroupMember, requireListOwner } from "@/lib/authz";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

export async function createTogetherList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const title = s(formData, "title");
    const anniversary = s(formData, "anniversary") || null;
    const ownerIds = formData.getAll("ownerIds").filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    await requireGroupMember(groupId, user.id);

    if (!title || title.length > 120) {
      return { error: "Enter a list title." };
    }
    const uniqueOwners = [...new Set([user.id, ...ownerIds])];
    if (uniqueOwners.length < 2) {
      return { error: "Together lists need at least two owners." };
    }

    for (const oid of uniqueOwners) {
      const m = await sql(
        "select 1 from group_members where group_id = $1 and user_id = $2",
        [groupId, oid],
      );
      if (!m.length) return { error: "All owners must be group members." };
    }

    const list = await sql<{ id: string }>(
      `insert into wish_lists (group_id, title, list_type, anniversary)
       values ($1, $2, 'together', $3) returning id`,
      [groupId, title, anniversary],
    );
    for (const oid of uniqueOwners) {
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list[0].id, oid],
      );
    }
    redirect(`/groups/${groupId}/lists/${list[0].id}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not create together list." };
  }
}

export async function renameList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const listId = s(formData, "listId");
    const title = s(formData, "title");
    await requireListOwner(listId, user.id);
    if (!title) return { error: "Title required." };
    await sql(`update wish_lists set title = $1 where id = $2`, [title, listId]);
    const g = await sql<{ group_id: string }>(
      "select group_id from wish_lists where id = $1",
      [listId],
    );
    revalidatePath(`/groups/${g[0].group_id}/lists/${listId}`);
    return { ok: "Renamed." };
  } catch {
    return { error: "Could not rename list." };
  }
}
