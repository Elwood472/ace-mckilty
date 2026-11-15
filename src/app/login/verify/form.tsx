"use client";

import { useActionState } from "react";
import {
  resendTwoFactorEmail,
  verifyTwoFactorLogin,
  type TwoFactorState,
} from "@/app/actions/two-factor";
import { CsrfField } from "@/components/csrf-field";

const initial: TwoFactorState = {};

export function VerifyTwoFactorForm({
  csrf,
  showEmailResend,
}: {
  csrf: string;
  showEmailResend: boolean;
}) {
  const [state, verifyAction, verifying] = useActionState(
    verifyTwoFactorLogin,
    initial,
  );
  const [resendState, resendAction, resending] = useActionState(
    resendTwoFactorEmail,
    initial,
  );

  const flash = state.error || resendState.error;
  const ok = resendState.ok;
  const stub = resendState.stubDevCode;

  return (
    <div className="panel" style={{ padding: 16, maxWidth: 360, width: "100%" }}>
      <form action={verifyAction}>
        <CsrfField token={csrf} />
        <div style={{ marginBottom: 12 }}>
          <label className="label" htmlFor="code">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            className="field"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
          />
        </div>
        {flash ? (
          <p style={{ color: "#cc0000", fontWeight: 700 }}>{flash}</p>
        ) : null}
        {ok ? <p style={{ color: "#060", fontWeight: 700 }}>{ok}</p> : null}
        {stub ? (
          <p style={{ fontSize: 12, color: "#555" }}>
            Local stub code: <code>{stub}</code>
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={verifying}
        >
          {verifying ? "Checking…" : "Verify and sign in"}
        </button>
      </form>
      {showEmailResend ? (
        <form action={resendAction} style={{ marginTop: 12 }}>
          <CsrfField token={csrf} />
          <button
            type="submit"
            className="btn"
            disabled={resending}
            style={{ fontSize: 13 }}
          >
            {resending ? "Sending…" : "Resend email code"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
