"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import { requireListOwner } from "@/lib/authz";
import { ensurePersonalList } from "@/lib/lists";
import { arePeopleRelated } from "@/lib/people";
import { LIST_TITLE_MAX, sanitizePublicLabel } from "@/lib/text";

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
    await ensurePersonalList(user.id, user.display_name);

    const title = sanitizePublicLabel(s(formData, "title"), LIST_TITLE_MAX);
    const anniversary = s(formData, "anniversary") || null;
    const ownerIds = formData
      .getAll("ownerIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    if (!title) {
      return { error: `Enter a list title (max ${LIST_TITLE_MAX} characters).` };
    }
    const uniqueOwners = [...new Set([user.id, ...ownerIds])];
    if (uniqueOwners.length < 2) {
      return { error: "Together lists need at least one other owner." };
    }

    for (const oid of uniqueOwners) {
      if (oid === user.id) continue;
      const exists = await sql("select 1 from users where id = $1", [oid]);
      if (!exists.length) return { error: "All co-owners must be real accounts." };
      // Co-owners must already share a list relationship (invite / access).
      if (!(await arePeopleRelated(user.id, oid))) {
        return {
          error:
            "Co-owners must already share list access with you. Invite or approve them first.",
        };
      }
    }

    const list = await sql<{ id: string }>(
      `insert into wish_lists (group_id, title, list_type, anniversary)
       values (null, $1, 'together', $2) returning id`,
      [title, anniversary],
    );
    for (const oid of uniqueOwners) {
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list[0].id, oid],
      );
    }
    redirect(`/lists/${list[0].id}`);
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
    const title = sanitizePublicLabel(s(formData, "title"), LIST_TITLE_MAX);
    await requireListOwner(listId, user.id);
    if (!title) {
      return { error: `Enter a list title (max ${LIST_TITLE_MAX} characters).` };
    }
    await sql(`update wish_lists set title = $1 where id = $2`, [title, listId]);
    revalidatePath(`/lists/${listId}`);
    return { ok: "Renamed." };
  } catch {
    return { error: "Could not rename list." };
  }
}
