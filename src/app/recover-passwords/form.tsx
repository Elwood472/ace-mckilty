"use client";

import { useActionState } from "react";
import { CsrfField } from "@/components/csrf-field";
import {
  finishRecoverPasswordsAction,
  recoverPasswordAction,
  type RecoverPasswordState,
} from "@/app/actions/recover-password";

const initial: RecoverPasswordState = {};

export function RecoverPasswordForm({
  csrf,
  bothSet,
}: {
  csrf: string;
  bothSet: boolean;
}) {
  const [state, action, pending] = useActionState(
    recoverPasswordAction,
    initial,
  );
  const [doneState, doneAction, donePending] = useActionState(
    finishRecoverPasswordsAction,
    initial,
  );

  return (
    <div style={{ maxWidth: 36 * 16 }}>
      <form action={action} autoComplete="off">
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
            <b>Imported account email</b>
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

      {(bothSet || state.ok) && (
        <form action={doneAction} style={{ marginTop: 24 }} autoComplete="off">
          <CsrfField token={csrf} />
          <p style={{ fontSize: 13 }}>
            When both imported accounts have new passwords, lock recovery and
            remove <code>IMPORT_SECRET</code>.
          </p>
          <p>
            <label>
              <b>Import secret</b> (confirm)
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
            <button type="submit" disabled={donePending}>
              {donePending ? "Locking…" : "Done — lock recovery"}
            </button>
          </p>
          {doneState.error ? (
            <p style={{ color: "#800" }} role="alert">
              {doneState.error}
            </p>
          ) : null}
          {doneState.ok ? (
            <p style={{ color: "#060" }} role="status">
              {doneState.ok}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
