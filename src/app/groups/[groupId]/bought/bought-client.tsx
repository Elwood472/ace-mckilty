"use client";

import { useActionState } from "react";
import { unpurchase, type ActionState } from "@/app/actions/items";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function PutBackForm({
  csrf,
  itemId,
}: {
  csrf: string;
  itemId: string;
}) {
  const [state, action, pending] = useActionState(unpurchase, initial);
  return (
    <form action={action}>
      <CsrfField token={csrf} />
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        className="text-xs font-semibold text-pine underline"
        disabled={pending}
      >
        {pending ? "…" : "Put it back"}
      </button>
      <Flash error={state.error} ok={state.ok} />
    </form>
  );
}
