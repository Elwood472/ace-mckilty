"use client";

import { useActionState } from "react";
import {
  createListEmailInvite,
  decideAccessRequest,
  type ActionState,
} from "@/app/actions/access";
import { createTogetherList } from "@/app/actions/lists";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function InviteMyListForm({
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
      <label className="label" htmlFor="invite-email">
        Friend&apos;s email
      </label>
      <input
        id="invite-email"
        name="email"
        type="email"
        className="field"
        required
        placeholder="friend@example.com"
      />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Email invite link"}
      </button>
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

export function CreateTogetherForm({
  csrf,
  candidates,
}: {
  csrf: string;
  candidates: { id: string; display_name: string }[];
}) {
  const [state, action, pending] = useActionState(createTogetherList, initial);
  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <Flash error={state.error} />
      <label className="label" htmlFor="together-title">
        Title
      </label>
      <input
        id="together-title"
        name="title"
        className="field"
        required
        maxLength={120}
        placeholder="Mom & Dad — shared list"
      />
      <label className="label" htmlFor="anniversary">
        Anniversary (optional)
      </label>
      <input id="anniversary" name="anniversary" type="date" className="field" />
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Shared list for a couple or group gift. Anniversary is optional metadata —
        not a home directory.
      </p>
      <fieldset style={{ border: "1px solid #ccc", padding: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 700 }}>Also owns this list</legend>
        {candidates.length === 0 ? (
          <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
            Invite or approve someone first, then add them as a co-owner.
          </p>
        ) : (
          candidates.map((c) => (
            <label
              key={c.id}
              style={{ display: "block", fontSize: 13, marginBottom: 4 }}
            >
              <input type="checkbox" name="ownerIds" value={c.id} /> {c.display_name}
            </label>
          ))
        )}
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create together list"}
      </button>
    </form>
  );
}
