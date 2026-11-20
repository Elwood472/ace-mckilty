"use client";

import { useActionState } from "react";
import {
  resendSignupVerificationAction,
  type AuthState,
} from "@/app/actions/auth";
import { CsrfField } from "@/components/csrf-field";

const initial: AuthState = {};

export function ResendVerifyForm({
  csrf,
  defaultEmail,
}: {
  csrf: string;
  defaultEmail: string;
}) {
  const [state, action, pending] = useActionState(
    resendSignupVerificationAction,
    initial,
  );

  return (
    <form action={action}>
      <CsrfField token={csrf} />
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Didn&apos;t get it? Enter your email to send another link.
      </p>
      <label className="label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className="field"
        required
        defaultValue={defaultEmail}
        autoComplete="email"
      />
      {state.error ? (
        <p style={{ color: "#cc0000", fontWeight: 700 }}>{state.error}</p>
      ) : null}
      {state.ok ? (
        <p style={{ color: "#060", fontWeight: 700 }}>{state.ok}</p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending}
        style={{ marginTop: 8 }}
      >
        {pending ? "Sending…" : "Resend confirmation"}
      </button>
    </form>
  );
}
