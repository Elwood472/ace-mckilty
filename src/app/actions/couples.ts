"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import { requireGroupMember } from "@/lib/authz";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

export async function createCouple(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const userA = s(formData, "userA");
    const userB = s(formData, "userB");
    const label = s(formData, "label");
    const anniversary = s(formData, "anniversary") || null;
    await requireGroupMember(groupId, user.id);

    if (!label) return { error: "Enter a couple label (e.g. Mom & Dad)." };
    if (!userA || !userB || userA === userB) {
      return { error: "Pick two different people." };
    }

    for (const uid of [userA, userB]) {
      const m = await sql(
        "select 1 from group_members where group_id = $1 and user_id = $2",
        [groupId, uid],
      );
      if (!m.length) return { error: "Both people must be in the group." };
    }

    const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
    await sql(
      `insert into couples (group_id, user_a_id, user_b_id, label, anniversary)
       values ($1,$2,$3,$4,$5)
       on conflict (group_id, user_a_id, user_b_id) do update
         set label = excluded.label,
             anniversary = excluded.anniversary`,
      [groupId, a, b, label, anniversary],
    );

    // Ensure a together list exists for the couple
    const existing = await sql<{ id: string }>(
      `select l.id from wish_lists l
       join wish_list_owners oa on oa.list_id = l.id and oa.user_id = $2
       join wish_list_owners ob on ob.list_id = l.id and ob.user_id = $3
       where l.group_id = $1 and l.list_type = 'together'
       limit 1`,
      [groupId, a, b],
    );
    if (!existing.length) {
      const list = await sql<{ id: string }>(
        `insert into wish_lists (group_id, title, list_type)
         values ($1, $2, 'together') returning id`,
        [groupId, label],
      );
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1,$2), ($1,$3)`,
        [list[0].id, a, b],
      );
    }

    revalidatePath("/dashboard");
    revalidatePath(`/groups/${groupId}`);
    return { ok: "Couple saved." };
  } catch {
    return { error: "Could not save couple." };
  }
}
