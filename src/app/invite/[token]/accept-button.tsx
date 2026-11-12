"use client";

import { useState, useTransition } from "react";
import { acceptInviteToken } from "@/app/actions/groups";
import { Flash } from "@/components/flash";

export function AcceptInviteButton({ token }: { token: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  return (
    <div>
      <Flash error={error} />
      <button
        type="button"
        className="btn btn-amber"
        disabled={pending}
        onClick={() => {
          start(async () => {
            const res = await acceptInviteToken(token);
            if (res?.error) setError(res.error);
          });
        }}
      >
        {pending ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
