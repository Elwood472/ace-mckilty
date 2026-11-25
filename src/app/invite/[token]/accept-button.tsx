"use client";

import { useState, useTransition } from "react";
import { acceptListInviteToken } from "@/app/actions/access";
import { Flash } from "@/components/flash";

export function AcceptInviteButton({
  token,
  csrf,
}: {
  token: string;
  csrf: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  return (
    <div>
      <Flash error={error} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          start(async () => {
            const res = await acceptListInviteToken(token, csrf);
            if (res?.error) setError(res.error);
          });
        }}
      >
        {pending ? "Accepting…" : "Accept invite"}
      </button>
    </div>
  );
}
