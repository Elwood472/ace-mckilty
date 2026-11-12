"use client";

import { useActionState } from "react";
import {
  purgeBoughtItem,
  unpurchase,
  type ActionState,
} from "@/app/actions/items";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function BoughtActions({
  csrf,
  itemId,
  purchaseId,
}: {
  csrf: string;
  itemId: string;
  purchaseId: string;
}) {
  const [putState, putAction, putPending] = useActionState(unpurchase, initial);
  const [purgeState, purgeAction, purgePending] = useActionState(
    purgeBoughtItem,
    initial,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <form action={putAction}>
        <CsrfField token={csrf} />
        <input type="hidden" name="itemId" value={itemId} />
        <button type="submit" className="btn" disabled={putPending}>
          Put it back...
        </button>
        <Flash error={putState.error} ok={putState.ok} />
      </form>
      <form action={purgeAction}>
        <CsrfField token={csrf} />
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <button type="submit" className="btn btn-danger" disabled={purgePending}>
          PURGE...
        </button>
        <Flash error={purgeState.error} ok={purgeState.ok} />
      </form>
    </div>
  );
}
