"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createListEmailInvite,
  decideAccessRequest,
  revokeListAccess,
  updateListAccessRole,
  type ActionState,
} from "@/app/actions/access";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function InviteForm({
  csrf,
  listId,
}: {
  csrf: string;
  listId: string;
}) {
  const [state, action, pending] = useActionState(createListEmailInvite, initial);
  const [flash, setFlash] = useState<{ ok?: string; error?: string }>({});
  useEffect(() => {
    if (state.ok) setFlash({ ok: state.ok });
    else if (state.error) setFlash({ error: state.error });
  }, [state.ok, state.error]);

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={() => setFlash({})}
    >
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <Flash error={flash.error} ok={flash.ok} />
      <label className="label" htmlFor="email">
        Email invite
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className="field"
        required
        placeholder="friend@example.com"
      />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Email invite link"}
      </button>
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Sends an email with an invite link. If it doesn&apos;t arrive, check spam
        — the open invite also appears in the list below.
      </p>
    </form>
  );
}

export function DecideRequestForm({
  csrf,
  requestId,
}: {
  csrf: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(decideAccessRequest, initial);
  return (
    <div>
      <Flash error={state.error} ok={state.ok} />
      <form action={action} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="approve" />
        <button type="submit" className="btn" disabled={pending} style={{ marginRight: 6 }}>
          Approve
        </button>
      </form>
      <form action={action} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="deny" />
        <button type="submit" className="btn" disabled={pending}>
          Deny
        </button>
      </form>
    </div>
  );
}

export function RevokeAccessForm({
  csrf,
  listId,
  userId,
}: {
  csrf: string;
  listId: string;
  userId: string;
}) {
  const [state, action, pending] = useActionState(revokeListAccess, initial);
  return (
    <form action={action}>
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="text-xs font-semibold text-danger" disabled={pending}>
        Revoke
      </button>
      <Flash error={state.error} />
    </form>
  );
}

export function SetAccessRoleForm({
  csrf,
  listId,
  userId,
  role,
}: {
  csrf: string;
  listId: string;
  userId: string;
  role: "viewer" | "editor";
}) {
  const [state, action, pending] = useActionState(updateListAccessRole, initial);
  const nextRole = role === "editor" ? "viewer" : "editor";
  const label =
    role === "editor" ? "Make shopper" : "Allow edit gifts";
  return (
    <form action={action} style={{ display: "inline" }}>
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={nextRole} />
      <button
        type="submit"
        className="text-xs font-semibold"
        style={{ color: "var(--navy)" }}
        disabled={pending}
        title={
          nextRole === "editor"
            ? "They can add/edit/remove gifts; purchase status stays hidden from them"
            : "They can shop again and will see purchase status; they can no longer edit gifts"
        }
      >
        {pending ? "…" : label}
      </button>
      <Flash error={state.error} ok={state.ok} />
    </form>
  );
}
