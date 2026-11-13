"use client";

import { useActionState } from "react";
import {
  createGroup,
  joinByInviteCode,
  type ActionState,
} from "@/app/actions/groups";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function CreateGroupForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(createGroup, initial);
  return (
    <form action={action} className="mt-4 space-y-3">
      <CsrfField token={csrf} />
      <Flash error={state.error} />
      <label className="label" htmlFor="name">
        Circle name
      </label>
      <input
        id="name"
        name="name"
        className="field"
        placeholder="Family & close friends"
        required
        maxLength={120}
      />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Create friend circle"}
      </button>
    </form>
  );
}

export function JoinGroupForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(joinByInviteCode, initial);
  return (
    <form action={action} className="mt-4 space-y-3">
      <CsrfField token={csrf} />
      <Flash error={state.error} />
      <label className="label" htmlFor="code">
        Invite code
      </label>
      <input id="code" name="code" className="field" required />
      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Joining…" : "Join circle"}
      </button>
    </form>
  );
}
