"use client";

import { useActionState } from "react";
import {
  createListEmailInvite,
  decideAccessRequest,
  revokeListAccess,
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
  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <Flash error={state.error} ok={state.ok} />
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
        Sends a magic link when <code>RESEND_API_KEY</code> is set; otherwise the
        link is shown here.
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
