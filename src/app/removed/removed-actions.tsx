"use client";

import { useActionState } from "react";
import {
  purgeRemovedItem,
  restoreItem,
  type ActionState,
} from "@/app/actions/items";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function RemovedActions({
  csrf,
  itemId,
}: {
  csrf: string;
  itemId: string;
}) {
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreItem,
    initial,
  );
  const [purgeState, purgeAction, purgePending] = useActionState(
    purgeRemovedItem,
    initial,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <form action={restoreAction}>
        <CsrfField token={csrf} />
        <input type="hidden" name="itemId" value={itemId} />
        <button type="submit" className="btn" disabled={restorePending}>
          Put it back...
        </button>
        <Flash error={restoreState.error} ok={restoreState.ok} />
      </form>
      <form action={purgeAction}>
        <CsrfField token={csrf} />
        <input type="hidden" name="itemId" value={itemId} />
        <button type="submit" className="btn btn-danger" disabled={purgePending}>
          PURGE...
        </button>
        <Flash error={purgeState.error} ok={purgeState.ok} />
      </form>
    </div>
  );
}
