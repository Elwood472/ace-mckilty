"use client";

import { useActionState } from "react";
import {
  requestListAccess,
  type ActionState,
} from "@/app/actions/access";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function RequestAccessButton({
  csrf,
  listId,
  ownerUserId,
}: {
  csrf: string;
  listId: string;
  ownerUserId: string;
}) {
  const [state, action, pending] = useActionState(requestListAccess, initial);
  return (
    <form action={action}>
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="ownerUserId" value={ownerUserId} />
      <Flash error={state.error} ok={state.ok} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Requesting…" : "Request access to their list"}
      </button>
    </form>
  );
}
