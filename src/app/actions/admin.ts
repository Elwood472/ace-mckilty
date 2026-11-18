"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { absoluteAppUrl } from "@/lib/app-url";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { grantListAccess } from "@/lib/authz";
import { assertCsrf } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { inviteEmailBody, sendEmail } from "@/lib/email";
import { getPersonalListId } from "@/lib/lists";
import { adminIssuePasswordReset } from "@/lib/password-reset";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

function revalidateAdminUser(userId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
}

export async function adminResendInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const inviteId = s(formData, "inviteId");
    const targetUserId = s(formData, "targetUserId");
    if (!inviteId) return { error: "Missing invite." };

    const rows = await sql<{
      id: string;
      list_id: string;
      email: string | null;
      token: string;
    }>(
      `select i.id, i.list_id, i.email, i.token
       from list_invites i
       where i.id = $1
         and i.accepted_at is null
         and i.expires_at > now()`,
      [inviteId],
    );
    if (!rows.length) return { error: "Invite not found or already used." };
    const invite = rows[0];
    if (!invite.email) return { error: "Invite has no email address." };

    const owners = await sql<{ display_name: string }>(
      `select u.display_name
       from wish_list_owners o
       join users u on u.id = o.user_id
       where o.list_id = $1
       order by u.display_name`,
      [invite.list_id],
    );
    const { DISPLAY_NAME_MAX, sanitizePublicLabel } = await import(
      "@/lib/text"
    );
    const ownerLabel = owners
      .map((o) => sanitizePublicLabel(o.display_name, DISPLAY_NAME_MAX))
      .filter((n): n is string => !!n)
      .join(", ");

    const inviteUrl = absoluteAppUrl(`/invite/${invite.token}`);
    const mail = inviteEmailBody({
      listOwnerLabel: ownerLabel,
      inviteUrl,
    });
    const sent = await sendEmail({
      to: invite.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    await writeAdminAudit({
      actorId: admin.id,
      action: "resend_invite",
      targetUserId: targetUserId || null,
      detail: {
        inviteId,
        email: invite.email,
        listId: invite.list_id,
        sentOk: sent.ok,
        mode: sent.mode,
      },
    });
    revalidateAdminUser(targetUserId);
    if (!sent.ok) {
      return {
        ok: `Invite link ready (${inviteUrl}), but email failed: ${sent.error}`,
      };
    }
    if (sent.mode === "stub") {
      return { ok: `Email stubbed. Invite link: ${inviteUrl}` };
    }
    return { ok: `Invite re-emailed to ${invite.email}. Link: ${inviteUrl}` };
  } catch {
    return { error: "Could not resend invite." };
  }
}

export async function adminCancelInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const inviteId = s(formData, "inviteId");
    const targetUserId = s(formData, "targetUserId");
    if (!inviteId) return { error: "Missing invite." };

    const updated = await sql<{ id: string; email: string | null }>(
      `update list_invites
       set accepted_at = coalesce(accepted_at, now())
       where id = $1 and accepted_at is null
       returning id, email`,
      [inviteId],
    );
    if (!updated.length) return { error: "Invite already closed." };

    await writeAdminAudit({
      actorId: admin.id,
      action: "cancel_invite",
      targetUserId: targetUserId || null,
      detail: { inviteId, email: updated[0].email },
    });
    revalidateAdminUser(targetUserId);
    return { ok: "Invite cancelled." };
  } catch {
    return { error: "Could not cancel invite." };
  }
}

export async function adminRotateInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const inviteId = s(formData, "inviteId");
    const targetUserId = s(formData, "targetUserId");
    if (!inviteId) return { error: "Missing invite." };

    const token = nanoid(24);
    const rows = await sql<{ id: string; email: string | null; token: string }>(
      `update list_invites
       set token = $2,
           expires_at = now() + interval '14 days',
           accepted_at = null
       where id = $1 and accepted_at is null
       returning id, email, token`,
      [inviteId, token],
    );
    if (!rows.length) return { error: "Invite not found or already used." };

    const inviteUrl = absoluteAppUrl(`/invite/${rows[0].token}`);
    await writeAdminAudit({
      actorId: admin.id,
      action: "rotate_invite",
      targetUserId: targetUserId || null,
      detail: { inviteId, email: rows[0].email },
    });
    revalidateAdminUser(targetUserId);
    return { ok: `New invite link: ${inviteUrl}` };
  } catch {
    return { error: "Could not rotate invite." };
  }
}

export async function adminGrantAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    const mode = s(formData, "mode"); // to_target | from_target
    const otherEmail = s(formData, "otherEmail").toLowerCase();
    if (!targetUserId || !otherEmail.includes("@")) {
      return { error: "Enter a valid email." };
    }

    const others = await sql<{ id: string; email: string; display_name: string }>(
      "select id, email, display_name from users where lower(email) = $1",
      [otherEmail],
    );
    if (!others.length) return { error: "No account with that email." };
    const other = others[0];

    let listId: string | null = null;
    let viewerId: string;
    let ownerSideId: string;

    if (mode === "to_target") {
      // Other owns the list; target becomes viewer.
      listId = await getPersonalListId(other.id);
      viewerId = targetUserId;
      ownerSideId = other.id;
    } else {
      // Target owns the list; other becomes viewer.
      listId = await getPersonalListId(targetUserId);
      viewerId = other.id;
      ownerSideId = targetUserId;
    }

    if (!listId) return { error: "Personal list not found." };
    if (viewerId === ownerSideId) {
      return { error: "Owner already has access to their own list." };
    }

    await grantListAccess(listId, viewerId, admin.id);
    const viewerEmailRows = await sql<{ email: string }>(
      "select email from users where id = $1",
      [viewerId],
    );
    const viewerEmail = viewerEmailRows[0]?.email?.toLowerCase() ?? "";
    if (viewerEmail) {
      await sql(
        `update list_invites
         set accepted_at = coalesce(accepted_at, now())
         where list_id = $1
           and email is not null
           and lower(email) = $2
           and accepted_at is null`,
        [listId, viewerEmail],
      );
    }

    await writeAdminAudit({
      actorId: admin.id,
      action: "grant_access",
      targetUserId,
      detail: { mode, listId, viewerId, otherEmail },
    });
    revalidateAdminUser(targetUserId);
    revalidatePath(`/lists/${listId}`);
    return { ok: "Access granted." };
  } catch {
    return { error: "Could not grant access." };
  }
}

export async function adminRevokeAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    const listId = s(formData, "listId");
    const viewerId = s(formData, "viewerId");
    if (!listId || !viewerId) return { error: "Missing access row." };

    await sql(
      `delete from list_access where list_id = $1 and user_id = $2`,
      [listId, viewerId],
    );
    await writeAdminAudit({
      actorId: admin.id,
      action: "revoke_access",
      targetUserId: targetUserId || null,
      detail: { listId, viewerId },
    });
    revalidateAdminUser(targetUserId);
    revalidatePath(`/lists/${listId}`);
    return { ok: "Access revoked." };
  } catch {
    return { error: "Could not revoke access." };
  }
}

export async function adminClearRateLimits(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    if (!targetUserId) return { error: "Missing user." };

    const users = await sql<{ email: string }>(
      "select email from users where id = $1",
      [targetUserId],
    );
    if (!users.length) return { error: "User not found." };
    const email = users[0].email.toLowerCase();

    const deleted = await sql<{ key: string }>(
      `delete from auth_rate_limits
       where key ilike '%' || $1 || '%'
          or key ilike '%' || $2 || '%'
       returning key`,
      [targetUserId, email],
    );

    await writeAdminAudit({
      actorId: admin.id,
      action: "clear_rate_limits",
      targetUserId,
      detail: { cleared: deleted.map((r) => r.key) },
    });
    revalidateAdminUser(targetUserId);
    return {
      ok:
        deleted.length > 0
          ? `Cleared ${deleted.length} rate-limit key(s).`
          : "No rate-limit keys found for this user.",
    };
  } catch {
    return { error: "Could not clear rate limits." };
  }
}

export async function adminSendPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    if (!targetUserId) return { error: "Missing user." };

    const result = await adminIssuePasswordReset(targetUserId);
    await writeAdminAudit({
      actorId: admin.id,
      action: "password_reset",
      targetUserId,
      detail: {
        email: result.email,
        sentOk: result.sent.ok,
        mode: result.sent.mode,
      },
    });
    revalidateAdminUser(targetUserId);
    if (!result.sent.ok) {
      return {
        ok: `Reset link ready (${result.resetUrl}), but email failed: ${result.sent.error}`,
      };
    }
    if (result.sent.mode === "stub") {
      return { ok: `Email stubbed. Reset link: ${result.resetUrl}` };
    }
    return {
      ok: `Password reset emailed to ${result.email}. Link: ${result.resetUrl}`,
    };
  } catch {
    return { error: "Could not create password reset." };
  }
}

export async function adminSignOutSessions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    if (!targetUserId) return { error: "Missing user." };

    const deleted = await sql<{ id: string }>(
      `delete from sessions where user_id = $1 returning id`,
      [targetUserId],
    );
    await sql(`delete from auth_challenges where user_id = $1`, [targetUserId]);

    await writeAdminAudit({
      actorId: admin.id,
      action: "sign_out_sessions",
      targetUserId,
      detail: { sessions: deleted.length },
    });
    revalidateAdminUser(targetUserId);
    return { ok: `Signed out ${deleted.length} session(s).` };
  } catch {
    return { error: "Could not sign out sessions." };
  }
}

export async function adminResetTwoFactor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const admin = await requireAdmin();
    const targetUserId = s(formData, "targetUserId");
    const confirm = s(formData, "confirm");
    if (!targetUserId) return { error: "Missing user." };
    if (confirm !== "RESET") {
      return { error: 'Type RESET in the confirm box to clear 2FA.' };
    }

    await sql(
      `update users
       set totp_enabled = false,
           email_2fa_enabled = false,
           totp_secret = null
       where id = $1`,
      [targetUserId],
    );
    await sql(`delete from totp_setup where user_id = $1`, [targetUserId]);
    await sql(`delete from auth_challenges where user_id = $1`, [targetUserId]);
    await sql(`delete from sessions where user_id = $1`, [targetUserId]);

    await writeAdminAudit({
      actorId: admin.id,
      action: "reset_2fa",
      targetUserId,
      detail: {},
    });
    revalidateAdminUser(targetUserId);
    return {
      ok: "2FA cleared and sessions signed out. They must re-enroll on next login.",
    };
  } catch {
    return { error: "Could not reset 2FA." };
  }
}
