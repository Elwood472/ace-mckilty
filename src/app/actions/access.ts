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
import { getClientIp } from "@/lib/client-ip";
import { appBaseUrl } from "@/lib/app-url";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

function inviteBaseUrl(): string {
  return appBaseUrl();
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
    const ip = await getClientIp();
    // Limits: open sign-up must not turn Resend into a spam relay, but a
    // normal gift-list owner needs room to invite family/friends.
    if (
      !(await checkRateLimit(`create-invite:${user.id}`, {
        maxHits: 8,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many invites. Try again later." };
    }
    if (
      !(await checkRateLimit(`create-invite-ip:${ip}`, {
        maxHits: 12,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many invites. Try again later." };
    }
    if (
      !(await checkRateLimit(`outbound-email-ip:${ip}`, {
        maxHits: 20,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many emails from this network. Try again later." };
    }
    if (
      !(await checkRateLimit(`outbound-email-global`, {
        maxHits: 80,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Email sending is temporarily limited. Try again later." };
    }
    if (
      !(await checkRateLimit(`create-invite-day:${user.id}`, {
        maxHits: 20,
        windowMs: 24 * 60 * 60 * 1000,
      }))
    ) {
      return { error: "Daily invite limit reached. Try again tomorrow." };
    }
    // New accounts: generous enough for a household list, still capped.
    const age = await sql<{ created_at: string }>(
      "select created_at::text as created_at from users where id = $1",
      [user.id],
    );
    const createdMs = age[0] ? new Date(age[0].created_at).getTime() : 0;
    if (Date.now() - createdMs < 48 * 60 * 60 * 1000) {
      if (
        !(await checkRateLimit(`create-invite-new:${user.id}`, {
          maxHits: 15,
          windowMs: 48 * 60 * 60 * 1000,
        }))
      ) {
        return {
          error:
            "New accounts can send a limited number of invites in the first two days. Try again later.",
        };
      }
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
        ok: `Invite created. Email stubbed (set RESEND_API_KEY to send). Invite link: ${invitePath}`,
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
  csrf?: string,
): Promise<ActionState> {
  try {
    await assertCsrf(csrf ?? null);
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }
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

    const amOwner = await sql(
      "select 1 from wish_list_owners where list_id = $1 and user_id = $2",
      [listId, user.id],
    );
    if (amOwner.length) return { error: "You already own this list." };

    const ip = await getClientIp();
    if (
      !(await checkRateLimit(`access-req:${user.id}`, {
        maxHits: 8,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many requests. Try again later." };
    }
    if (
      !(await checkRateLimit(`access-req-ip:${ip}`, {
        maxHits: 12,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many requests. Try again later." };
    }
    if (
      !(await checkRateLimit(`outbound-email-ip:${ip}`, {
        maxHits: 8,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many emails from this network. Try again later." };
    }
    if (
      !(await checkRateLimit(`outbound-email-global`, {
        maxHits: 80,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Email sending is temporarily limited. Try again later." };
    }
    const age = await sql<{ created_at: string }>(
      "select created_at::text as created_at from users where id = $1",
      [user.id],
    );
    const createdMs = age[0] ? new Date(age[0].created_at).getTime() : 0;
    if (Date.now() - createdMs < 24 * 60 * 60 * 1000) {
      if (
        !(await checkRateLimit(`access-req-new:${user.id}`, {
          maxHits: 3,
          windowMs: 24 * 60 * 60 * 1000,
        }))
      ) {
        return {
          error:
            "New accounts can send only a few access requests on the first day.",
        };
      }
    }

    const alreadyPending = await sql(
      `select 1 from list_access_requests
       where list_id = $1 and requester_id = $2 and status = 'pending'`,
      [listId, user.id],
    );
    if (alreadyPending.length) {
      return { ok: "Access request already pending." };
    }

    await sql(
      `insert into list_access_requests (list_id, requester_id, status)
       values ($1, $2, 'pending')
       on conflict (list_id, requester_id) do update
         set status = 'pending', decided_at = null, created_at = now()`,
      [listId, user.id],
    );

    // Same Resend path as invites when RESEND_API_KEY is set (else stub).
    const ownerRecipients = await sql<{ email: string; display_name: string }>(
      `select u.email, u.display_name
       from wish_list_owners o
       join users u on u.id = o.user_id
       where o.list_id = $1`,
      [listId],
    );
    const listMeta = await sql<{ title: string }>(
      "select title from wish_lists where id = $1",
      [listId],
    );
    const { accessRequestEmailBody, sendEmail } = await import("@/lib/email");
    const base = inviteBaseUrl();
    const reviewPath = `/lists/${listId}`;
    const reviewUrl = base
      ? `${base.replace(/\/$/, "")}${reviewPath}`
      : `(open in the app) ${reviewPath}`;
    const mail = accessRequestEmailBody({
      listTitle: listMeta[0]?.title ?? "a wish list",
      requesterName: user.display_name,
      requesterEmail: user.email,
      reviewUrl,
    });
    let emailed = 0;
    let stubbed = false;
    let mailError: string | undefined;
    for (const owner of ownerRecipients) {
      if (owner.email.toLowerCase() === user.email.toLowerCase()) continue;
      const sent = await sendEmail({
        to: owner.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (!sent.ok) {
        mailError = sent.error;
        continue;
      }
      if (sent.mode === "stub") stubbed = true;
      else emailed += 1;
    }

    revalidatePath("/dashboard");
    revalidatePath(`/lists/${listId}`);
    if (ownerUserId) revalidatePath(`/profile/${ownerUserId}`);

    if (mailError) {
      return {
        ok: `Access requested. Owner email failed: ${mailError}`,
      };
    }
    if (stubbed) {
      return {
        ok: "Access requested. Owner email stubbed (set RESEND_API_KEY to send).",
      };
    }
    if (emailed > 0) {
      return { ok: "Access requested. Owner notified by email." };
    }
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
    email: string | null;
    personal_list_id: string | null;
    has_access: boolean;
    pending_request: boolean;
  }[]
> {
  const user = await requireUser();
  const ip = await getClientIp();
  if (
    !(await checkRateLimit(`people-search:${user.id}`, {
      maxHits: 20,
      windowMs: 15 * 60 * 1000,
    }))
  ) {
    return [];
  }
  if (
    !(await checkRateLimit(`people-search-ip:${ip}`, {
      maxHits: 25,
      windowMs: 15 * 60 * 1000,
    }))
  ) {
    return [];
  }
  return searchPeople(user.id, query);
}
