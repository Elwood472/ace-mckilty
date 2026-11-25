"use client";

import { useActionState, useRef } from "react";
import {
  setBoughtReceived,
  type ActionState,
} from "@/app/actions/items";
import { CsrfField } from "@/components/csrf-field";

const initial: ActionState = {};

export function ReceivedCheckbox({
  csrf,
  purchaseId,
  received,
}: {
  csrf: string;
  purchaseId: string;
  received: boolean;
}) {
  const [state, action, pending] = useActionState(setBoughtReceived, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <CsrfField token={csrf} />
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <input type="hidden" name="received" value={received ? "0" : "1"} />
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: pending ? "wait" : "pointer",
          fontSize: 13,
        }}
      >
        <input
          type="checkbox"
          checked={received}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
        />
        Received
      </label>
      {state.error ? (
        <div style={{ color: "#cc0000", fontSize: 12, fontWeight: 700 }}>
          {state.error}
        </div>
      ) : null}
    </form>
  );
}