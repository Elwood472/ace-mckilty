"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import {
  grantListAccess,
  requireListOwner,
  canViewList,
} from "@/lib/authz";
import { ensurePersonalList, getPersonalListId } from "@/lib/lists";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchPeople } from "@/lib/people";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

function inviteBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  );
}

export async function createListEmailInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const listId = s(formData, "listId");
    const email = s(formData, "email").toLowerCase();
    await requireListOwner(listId, user.id);
    if (!email || !email.includes("@")) {
      return { error: "Enter a valid email." };
    }
    if (!(await checkRateLimit(`create-invite:${user.id}`))) {
      return { error: "Too many invites. Try again later." };
    }

    const token = nanoid(24);
    await sql(
      `insert into list_invites (list_id, email, token, invited_by, expires_at)
       values ($1, $2, $3, $4, now() + interval '14 days')`,
      [listId, email, token, user.id],
    );

    const list = await sql<{ title: string }>(
      "select title from wish_lists where id = $1",
      [listId],
    );
    const { inviteEmailBody, sendEmail } = await import("@/lib/email");
    const base = inviteBaseUrl();
    const invitePath = `/invite/${token}`;
    const inviteUrl = base ? `${base.replace(/\/$/, "")}${invitePath}` : invitePath;
    const mail = inviteEmailBody({
      listTitle: list[0]?.title ?? "a wish list",
      inviterName: user.display_name,
      inviteUrl: base ? inviteUrl : `(open in the app) ${invitePath}`,
    });
    const sent = await sendEmail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    revalidatePath(`/lists/${listId}`);
    revalidatePath("/dashboard");
    if (!sent.ok) {
      return {
        ok: `Invite created (${invitePath}), but email failed: ${sent.error}`,
      };
    }
    if (sent.mode === "stub") {
      return {
        ok: `Invite created. Email stubbed (set RESEND_API_KEY to send). Link: ${invitePath}`,
      };
    }
    return { ok: `Invite emailed to ${email}.` };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "UNAUTHORIZED" || e.message === "FORBIDDEN")
    ) {
      return { error: "Not allowed." };
    }
    return { error: "Could not create invite." };
  }
}

export async function acceptListInviteToken(
  token: string,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    await ensurePersonalList(user.id, user.display_name);
    if (!(await checkRateLimit(`invite-token:${user.id}`))) {
      return { error: "Too many attempts. Try again later." };
    }
    const invites = await sql<{
      id: string;
      list_id: string;
      email: string | null;
    }>(
      `select id, list_id, email from list_invites
       where token = $1 and accepted_at is null and expires_at > now()`,
      [token],
    );
    if (!invites.length) return { error: "Invite is invalid or expired." };
    const invite = invites[0];
    if (
      invite.email &&
      invite.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      return { error: "This invite was sent to a different email." };
    }

    await grantListAccess(invite.list_id, user.id, null);
    await sql(`update list_invites set accepted_at = now() where id = $1`, [
      invite.id,
    ]);
    // Clear any pending request for this list
    await sql(
      `update list_access_requests set status = 'approved', decided_at = now()
       where list_id = $1 and requester_id = $2 and status = 'pending'`,
      [invite.list_id, user.id],
    );

    redirect(`/lists/${invite.list_id}`);
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { error: "Sign in required." };
    }
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { error: "Could not accept invite." };
  }
}

export async function requestListAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    let listId = s(formData, "listId");
    const ownerUserId = s(formData, "ownerUserId");

    if (!listId && ownerUserId) {
      listId = (await getPersonalListId(ownerUserId)) ?? "";
    }
    if (!listId) return { error: "List not found." };

    const list = await sql<{ id: string }>(
      "select id from wish_lists where id = $1",
      [listId],
    );
    if (!list.length) return { error: "List not found." };

    if (await canViewList(listId, user.id)) {
      return { ok: "You already have access." };
    }

    const owners = await sql(
      "select 1 from wish_list_owners where list_id = $1 and user_id = $2",
      [listId, user.id],
    );
    if (owners.length) return { error: "You already own this list." };

    if (!(await checkRateLimit(`access-req:${user.id}`))) {
      return { error: "Too many requests. Try again later." };
    }

    await sql(
      `insert into list_access_requests (list_id, requester_id, status)
       values ($1, $2, 'pending')
       on conflict (list_id, requester_id) do update
         set status = 'pending', decided_at = null, created_at = now()
         where list_access_requests.status <> 'pending'`,
      [listId, user.id],
    );

    revalidatePath("/dashboard");
    revalidatePath(`/lists/${listId}`);
    if (ownerUserId) revalidatePath(`/profile/${ownerUserId}`);
    return { ok: "Access requested. Waiting for approval." };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { error: "Sign in required." };
    }
    return { error: "Could not request access." };
  }
}

export async function decideAccessRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const requestId = s(formData, "requestId");
    const decision = s(formData, "decision"); // approve | deny
    if (decision !== "approve" && decision !== "deny") {
      return { error: "Invalid decision." };
    }

    const rows = await sql<{
      id: string;
      list_id: string;
      requester_id: string;
      status: string;
    }>(
      `select id, list_id, requester_id, status from list_access_requests
       where id = $1`,
      [requestId],
    );
    if (!rows.length) return { error: "Request not found." };
    const req = rows[0];
    if (req.status !== "pending") return { error: "Already decided." };
    await requireListOwner(req.list_id, user.id);

    if (decision === "approve") {
      await grantListAccess(req.list_id, req.requester_id, user.id);
      await sql(
        `update list_access_requests
         set status = 'approved', decided_at = now() where id = $1`,
        [requestId],
      );
      revalidatePath("/dashboard");
      revalidatePath(`/lists/${req.list_id}`);
      return { ok: "Access approved." };
    }

    await sql(
      `update list_access_requests
       set status = 'denied', decided_at = now() where id = $1`,
      [requestId],
    );
    revalidatePath("/dashboard");
    revalidatePath(`/lists/${req.list_id}`);
    return { ok: "Access denied." };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "UNAUTHORIZED" || e.message === "FORBIDDEN")
    ) {
      return { error: "Not allowed." };
    }
    return { error: "Could not update request." };
  }
}

export async function revokeListAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const listId = s(formData, "listId");
    const memberId = s(formData, "userId");
    await requireListOwner(listId, user.id);
    if (!memberId) return { error: "Pick a person." };
    await sql(
      "delete from list_access where list_id = $1 and user_id = $2",
      [listId, memberId],
    );
    revalidatePath(`/lists/${listId}`);
    revalidatePath("/dashboard");
    return { ok: "Access removed." };
  } catch {
    return { error: "Could not revoke access." };
  }
}

export async function searchPeopleAction(
  query: string,
): Promise<
  {
    id: string;
    display_name: string;
    email: string;
    personal_list_id: string | null;
    has_access: boolean;
    pending_request: boolean;
  }[]
> {
  const user = await requireUser();
  return searchPeople(user.id, query);
}
