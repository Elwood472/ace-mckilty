"use client";

import { useActionState } from "react";
import { CsrfField } from "@/components/csrf-field";
import {
  recoverPasswordAction,
  type RecoverPasswordState,
} from "@/app/actions/recover-password";

const initial: RecoverPasswordState = {};

export function RecoverPasswordForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(
    recoverPasswordAction,
    initial,
  );

  return (
    <form action={action} style={{ maxWidth: 36 * 16 }} autoComplete="off">
      <CsrfField token={csrf} />
      <p>
        <label>
          <b>Import secret</b>
          <br />
          <input
            type="password"
            name="importSecret"
            autoComplete="off"
            required
            style={{ width: "100%", maxWidth: 320 }}
          />
        </label>
      </p>
      <p>
        <label>
          <b>Account email</b>
          <br />
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            style={{ width: "100%", maxWidth: 320 }}
          />
        </label>
      </p>
      <p>
        <label>
          <b>New password</b>
          <br />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ width: "100%", maxWidth: 320 }}
          />
        </label>
      </p>
      <p>
        <label>
          <b>Confirm password</b>
          <br />
          <input
            type="password"
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ width: "100%", maxWidth: 320 }}
          />
        </label>
      </p>
      <p>
        <button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Set password"}
        </button>
      </p>
      {state.error ? (
        <p style={{ color: "#800" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p style={{ color: "#060" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
