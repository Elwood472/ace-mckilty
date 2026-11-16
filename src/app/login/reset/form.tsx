"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  completePasswordResetAction,
  type PasswordResetState,
} from "@/app/actions/password-reset";
import { CsrfField } from "@/components/csrf-field";

const initial: PasswordResetState = {};

export function ResetPasswordForm({
  csrf,
  token,
}: {
  csrf: string;
  token: string;
}) {
  const [state, formAction, pending] = useActionState(
    completePasswordResetAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="panel"
      style={{ padding: 16, maxWidth: 360, width: "100%" }}
    >
      <CsrfField token={csrf} />
      <input type="hidden" name="token" value={token} />
      <div style={{ marginBottom: 10 }}>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="field"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
        />
      </div>
      {state.error ? (
        <p style={{ color: "#cc0000", fontWeight: 700 }}>{state.error}</p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        <Link href="/login">← Back to login</Link>
      </p>
    </form>
  );
}
