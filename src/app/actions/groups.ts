"use server";

import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import {
  requireGroupMember,
  requireGroupOwner,
} from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

export async function createGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const name = s(formData, "name");
    if (!name || name.length > 120) {
      return { error: "Enter a group name (1–120 characters)." };
    }
    const inviteCode = nanoid(12);
    const rows = await sql<{ id: string }>(
      `insert into groups (name, owner_id, invite_code)
       values ($1, $2, $3) returning id`,
      [name, user.id, inviteCode],
    );
    const groupId = rows[0].id;
    await sql(
      `insert into group_members (group_id, user_id, role) values ($1, $2, 'owner')`,
      [groupId, user.id],
    );
    // Personal list for creator
    const list = await sql<{ id: string }>(
      `insert into wish_lists (group_id, title, list_type)
       values ($1, $2, 'personal') returning id`,
      [groupId, `${user.display_name}'s list`],
    );
    await sql(
      `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
      [list[0].id, user.id],
    );
    redirect(`/groups/${groupId}`);
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { error: "Sign in required." };
    }
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not create group." };
  }
}

export async function joinByInviteCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const code = s(formData, "code");
    if (!code) return { error: "Enter an invite code." };
    if (!(await checkRateLimit(`invite:${user.id}`))) {
      return { error: "Too many attempts. Try again later." };
    }

    const groups = await sql<{ id: string; name: string }>(
      "select id, name from groups where invite_code = $1",
      [code],
    );
    if (!groups.length) return { error: "Invite code not found." };
    const group = groups[0];

    await sql(
      `insert into group_members (group_id, user_id, role)
       values ($1, $2, 'member')
       on conflict do nothing`,
      [group.id, user.id],
    );

    // Ensure personal list
    const existing = await sql(
      `select l.id from wish_lists l
       join wish_list_owners o on o.list_id = l.id
       where l.group_id = $1 and l.list_type = 'personal' and o.user_id = $2`,
      [group.id, user.id],
    );
    if (!existing.length) {
      const list = await sql<{ id: string }>(
        `insert into wish_lists (group_id, title, list_type)
         values ($1, $2, 'personal') returning id`,
        [group.id, `${user.display_name}'s list`],
      );
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list[0].id, user.id],
      );
    }

    redirect(`/groups/${group.id}`);
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { error: "Sign in required." };
    }
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not join group." };
  }
}

export async function acceptInviteToken(token: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (!(await checkRateLimit(`invite-token:${user.id}`))) {
      return { error: "Too many attempts. Try again later." };
    }
    const invites = await sql<{
      id: string;
      group_id: string;
      email: string | null;
    }>(
      `select id, group_id, email from group_invites
       where token = $1 and accepted_at is null and expires_at > now()`,
      [token],
    );
    if (!invites.length) return { error: "Invite is invalid or expired." };
    const invite = invites[0];
    if (invite.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return { error: "This invite was sent to a different email." };
    }

    await sql(
      `insert into group_members (group_id, user_id, role)
       values ($1, $2, 'member') on conflict do nothing`,
      [invite.group_id, user.id],
    );
    await sql(
      `update group_invites set accepted_at = now() where id = $1`,
      [invite.id],
    );

    const existing = await sql(
      `select l.id from wish_lists l
       join wish_list_owners o on o.list_id = l.id
       where l.group_id = $1 and l.list_type = 'personal' and o.user_id = $2`,
      [invite.group_id, user.id],
    );
    if (!existing.length) {
      const list = await sql<{ id: string }>(
        `insert into wish_lists (group_id, title, list_type)
         values ($1, $2, 'personal') returning id`,
        [invite.group_id, `${user.display_name}'s list`],
      );
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list[0].id, user.id],
      );
    }

    redirect(`/groups/${invite.group_id}`);
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { error: "Sign in required." };
    }
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not accept invite." };
  }
}

export async function createEmailInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const email = s(formData, "email").toLowerCase();
    await requireGroupMember(groupId, user.id);
    if (!email || !email.includes("@")) {
      return { error: "Enter a valid email." };
    }
    if (!(await checkRateLimit(`create-invite:${user.id}`))) {
      return { error: "Too many invites. Try again later." };
    }
    const token = nanoid(24);
    await sql(
      `insert into group_invites (group_id, email, token, invited_by, expires_at)
       values ($1, $2, $3, $4, now() + interval '14 days')`,
      [groupId, email, token, user.id],
    );
    revalidatePath(`/groups/${groupId}`);
    return { ok: `Invite created. Share link: /invite/${token}` };
  } catch (e) {
    if (e instanceof Error && (e.message === "UNAUTHORIZED" || e.message === "FORBIDDEN")) {
      return { error: "Not allowed." };
    }
    return { error: "Could not create invite." };
  }
}

export async function searchUsers(
  groupId: string,
  query: string,
): Promise<{ id: string; display_name: string; email: string; in_group: boolean }[]> {
  const user = await requireUser();
  await requireGroupMember(groupId, user.id);
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await sql<{
    id: string;
    display_name: string;
    email: string;
    in_group: boolean;
  }>(
    `select u.id, u.display_name, u.email,
            exists(select 1 from group_members gm where gm.group_id = $1 and gm.user_id = u.id) as in_group
     from users u
     where u.id <> $2
       and (u.display_name ilike $3 or u.email ilike $3)
     order by u.display_name
     limit 20`,
    [groupId, user.id, `%${q}%`],
  );
  return rows;
}

export async function addMemberById(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const memberId = s(formData, "userId");
    await requireGroupMember(groupId, user.id);
    if (!memberId) return { error: "Pick a user." };

    await sql(
      `insert into group_members (group_id, user_id, role)
       values ($1, $2, 'member') on conflict do nothing`,
      [groupId, memberId],
    );

    const member = await sql<{ display_name: string }>(
      "select display_name from users where id = $1",
      [memberId],
    );
    const existing = await sql(
      `select l.id from wish_lists l
       join wish_list_owners o on o.list_id = l.id
       where l.group_id = $1 and l.list_type = 'personal' and o.user_id = $2`,
      [groupId, memberId],
    );
    if (!existing.length && member[0]) {
      const list = await sql<{ id: string }>(
        `insert into wish_lists (group_id, title, list_type)
         values ($1, $2, 'personal') returning id`,
        [groupId, `${member[0].display_name}'s list`],
      );
      await sql(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list[0].id, memberId],
      );
    }

    revalidatePath(`/groups/${groupId}`);
    return { ok: "Member added." };
  } catch {
    return { error: "Could not add member." };
  }
}

export async function removeMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const memberId = s(formData, "userId");
    await requireGroupOwner(groupId, user.id);
    if (memberId === user.id) {
      return { error: "Owner cannot remove themselves." };
    }
    await sql(
      "delete from group_members where group_id = $1 and user_id = $2",
      [groupId, memberId],
    );
    revalidatePath(`/groups/${groupId}`);
    return { ok: "Member removed." };
  } catch {
    return { error: "Could not remove member." };
  }
}

export async function leaveGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const groupId = s(formData, "groupId");
    const owner = await sql(
      "select 1 from groups where id = $1 and owner_id = $2",
      [groupId, user.id],
    );
    if (owner.length) {
      return { error: "Owner cannot leave. Transfer or delete the group first." };
    }
    await sql(
      "delete from group_members where group_id = $1 and user_id = $2",
      [groupId, user.id],
    );
    redirect("/dashboard");
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not leave group." };
  }
}
