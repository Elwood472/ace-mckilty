"use client";

import { useActionState } from "react";
import {
  adminCancelInvite,
  adminClearRateLimits,
  adminGrantAccess,
  adminResendInvite,
  adminResetTwoFactor,
  adminRevokeAccess,
  adminRotateInvite,
  adminSendPasswordReset,
  adminSignOutSessions,
  type ActionState,
} from "@/app/actions/admin";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function InviteRescueForms({
  csrf,
  inviteId,
  targetUserId,
  inviteUrl,
}: {
  csrf: string;
  inviteId: string;
  targetUserId: string;
  inviteUrl: string;
}) {
  const [resendState, resendAction, resendPending] = useActionState(
    adminResendInvite,
    initial,
  );
  const [rotateState, rotateAction, rotatePending] = useActionState(
    adminRotateInvite,
    initial,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    adminCancelInvite,
    initial,
  );
  const flash = resendState.ok || resendState.error
    ? resendState
    : rotateState.ok || rotateState.error
      ? rotateState
      : cancelState;

  return (
    <div style={{ fontSize: 12 }}>
      <Flash error={flash.error} ok={flash.ok} />
      <div style={{ wordBreak: "break-all", marginBottom: 4 }}>
        <a href={inviteUrl}>{inviteUrl}</a>
      </div>
      <form action={resendAction} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="inviteId" value={inviteId} />
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <button type="submit" className="btn" disabled={resendPending} style={{ marginRight: 4 }}>
          {resendPending ? "Sending…" : "Resend email"}
        </button>
      </form>
      <form action={rotateAction} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="inviteId" value={inviteId} />
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <button type="submit" className="btn" disabled={rotatePending} style={{ marginRight: 4 }}>
          {rotatePending ? "…" : "New link"}
        </button>
      </form>
      <form action={cancelAction} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="inviteId" value={inviteId} />
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <button type="submit" className="btn" disabled={cancelPending}>
          {cancelPending ? "…" : "Cancel"}
        </button>
      </form>
    </div>
  );
}

export function RevokeAccessForm({
  csrf,
  targetUserId,
  listId,
  viewerId,
}: {
  csrf: string;
  targetUserId: string;
  listId: string;
  viewerId: string;
}) {
  const [state, action, pending] = useActionState(adminRevokeAccess, initial);
  return (
    <div>
      <Flash error={state.error} ok={state.ok} />
      <form action={action}>
        <CsrfField token={csrf} />
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="viewerId" value={viewerId} />
        <button
          type="submit"
          className="btn"
          disabled={pending}
          style={{ color: "#a00", fontSize: 12 }}
        >
          {pending ? "…" : "Revoke"}
        </button>
      </form>
    </div>
  );
}

export function GrantAccessForms({
  csrf,
  targetUserId,
  targetEmail,
}: {
  csrf: string;
  targetUserId: string;
  targetEmail: string;
}) {
  return (
    <div className="space-y-3">
      <GrantOne
        csrf={csrf}
        targetUserId={targetUserId}
        mode="from_target"
        label={`Give someone access to ${targetEmail}'s list`}
        emailLabel="Viewer email"
      />
      <GrantOne
        csrf={csrf}
        targetUserId={targetUserId}
        mode="to_target"
        label={`Give ${targetEmail} access to someone's list`}
        emailLabel="List owner email"
      />
    </div>
  );
}

function GrantOne({
  csrf,
  targetUserId,
  mode,
  label,
  emailLabel,
}: {
  csrf: string;
  targetUserId: string;
  mode: "from_target" | "to_target";
  label: string;
  emailLabel: string;
}) {
  const [state, action, pending] = useActionState(adminGrantAccess, initial);
  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <input type="hidden" name="mode" value={mode} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <label className="label" htmlFor={`grant-${mode}`}>
        {emailLabel}
      </label>
      <input
        id={`grant-${mode}`}
        name="otherEmail"
        type="email"
        className="field"
        required
        placeholder="friend@example.com"
      />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Granting…" : "Grant access"}
      </button>
    </form>
  );
}

function UnlockButton({
  csrf,
  targetUserId,
  action,
  label,
  pendingLabel,
}: {
  csrf: string;
  targetUserId: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} style={{ marginBottom: 8 }}>
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

export function UnlockForms({
  csrf,
  targetUserId,
}: {
  csrf: string;
  targetUserId: string;
}) {
  return (
    <div>
      <UnlockButton
        csrf={csrf}
        targetUserId={targetUserId}
        action={adminClearRateLimits}
        label="Clear rate limits"
        pendingLabel="Clearing…"
      />
      <UnlockButton
        csrf={csrf}
        targetUserId={targetUserId}
        action={adminSendPasswordReset}
        label="Email password reset"
        pendingLabel="Sending…"
      />
      <UnlockButton
        csrf={csrf}
        targetUserId={targetUserId}
        action={adminSignOutSessions}
        label="Sign out all sessions"
        pendingLabel="…"
      />
      <Reset2faForm csrf={csrf} targetUserId={targetUserId} />
    </div>
  );
}

function Reset2faForm({
  csrf,
  targetUserId,
}: {
  csrf: string;
  targetUserId: string;
}) {
  const [state, action, pending] = useActionState(adminResetTwoFactor, initial);
  return (
    <form action={action} className="space-y-2" style={{ marginTop: 12 }}>
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Last resort: clears authenticator + email 2FA and signs them out. They
        must set 2FA up again. Type <b>RESET</b> to confirm.
      </p>
      <input
        name="confirm"
        className="field"
        placeholder="RESET"
        autoComplete="off"
        required
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Resetting…" : "Reset 2FA"}
      </button>
    </form>
  );
}
