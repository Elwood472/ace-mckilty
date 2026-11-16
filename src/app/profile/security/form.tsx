"use client";

import { useActionState } from "react";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableEmailTwoFactor,
  disableTotp,
  enableEmailTwoFactor,
  type TwoFactorState,
} from "@/app/actions/two-factor";
import { CsrfField } from "@/components/csrf-field";

const initial: TwoFactorState = {};

function Flash({ state }: { state: TwoFactorState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        style={{
          color: "#8a0000",
          fontWeight: 700,
          background: "#ffe8e8",
          padding: "8px 10px",
          marginBottom: 8,
        }}
      >
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p
        role="status"
        style={{
          color: "#064",
          fontWeight: 700,
          background: "#e7f7ec",
          padding: "8px 10px",
          marginBottom: 8,
        }}
      >
        {state.ok}
      </p>
    );
  }
  return null;
}

export function SecuritySettingsForm({
  csrf,
  totpEnabled,
  emailEnabled,
  emailAvailable,
  emailLive,
  setupRequired = false,
}: {
  csrf: string;
  totpEnabled: boolean;
  emailEnabled: boolean;
  emailAvailable: boolean;
  emailLive: boolean;
  setupRequired?: boolean;
}) {
  const [emailOn, enableEmail, enablingEmail] = useActionState(
    enableEmailTwoFactor,
    initial,
  );
  const [emailOff, disableEmail, disablingEmail] = useActionState(
    disableEmailTwoFactor,
    initial,
  );
  const [totpBegin, startTotp, startingTotp] = useActionState(
    beginTotpSetup,
    initial,
  );
  const [totpConfirm, confirmTotp, confirmingTotp] = useActionState(
    confirmTotpSetup,
    initial,
  );
  const [totpOff, turnOffTotp, disablingTotp] = useActionState(
    disableTotp,
    initial,
  );

  const setupQr = totpBegin.qrDataUrl;
  const setupSecret = totpBegin.secret;

  return (
    <div style={{ maxWidth: 480, marginTop: 16 }}>
      <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Email codes</h2>
        <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
          Backup sign-in codes by email. If your authenticator is also on, we
          only send a code when you ask for one on the login screen — not on
          every sign-in.
          {!emailLive
            ? " Bind RESEND_API_KEY for live email (local stub works without it)."
            : null}
        </p>
        <Flash state={emailOn} />
        <Flash state={emailOff} />
        {emailEnabled ? (
          setupRequired ? (
            <p style={{ fontWeight: 700, color: "#060" }}>Email codes are on.</p>
          ) : (
            <form action={disableEmail}>
              <CsrfField token={csrf} />
              <label className="label" htmlFor="email-off-password">
                Current password
              </label>
              <input
                id="email-off-password"
                name="password"
                type="password"
                className="field"
                required
                minLength={8}
                autoComplete="current-password"
              />
              <button
                type="submit"
                className="btn"
                disabled={disablingEmail}
                style={{ marginTop: 8 }}
              >
                {disablingEmail ? "Saving…" : "Turn off email codes"}
              </button>
            </form>
          )
        ) : (
          <form action={enableEmail}>
            <CsrfField token={csrf} />
            <label className="label" htmlFor="email-on-password">
              Current password
            </label>
            <input
              id="email-on-password"
              name="password"
              type="password"
              className="field"
              required
              minLength={8}
              autoComplete="current-password"
              disabled={!emailAvailable}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!emailAvailable || enablingEmail}
              style={{ marginTop: 8 }}
            >
              {enablingEmail ? "Saving…" : "Turn on email codes"}
            </button>
          </form>
        )}
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Authenticator app</h2>
        <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
          Use Google Authenticator, Authy, 1Password, or similar. Works offline
          after setup.
        </p>
        <Flash state={totpBegin} />
        <Flash state={totpConfirm} />
        <Flash state={totpOff} />

        {totpEnabled ? (
          setupRequired ? (
            <p style={{ fontWeight: 700, color: "#060" }}>Authenticator is on.</p>
          ) : (
            <form action={turnOffTotp}>
              <CsrfField token={csrf} />
              <p style={{ fontWeight: 700, color: "#060" }}>
                Authenticator is on.
              </p>
              <label className="label" htmlFor="totp-off-password">
                Current password
              </label>
              <input
                id="totp-off-password"
                name="password"
                type="password"
                className="field"
                required
                minLength={8}
                autoComplete="current-password"
              />
              <button
                type="submit"
                className="btn"
                disabled={disablingTotp}
                style={{ marginTop: 8 }}
              >
                {disablingTotp ? "Saving…" : "Turn off authenticator"}
              </button>
            </form>
          )
        ) : (
          <>
            {!setupQr ? (
              <form action={startTotp}>
                <CsrfField token={csrf} />
                <label className="label" htmlFor="totp-start-password">
                  Current password
                </label>
                <input
                  id="totp-start-password"
                  name="password"
                  type="password"
                  className="field"
                  required
                  minLength={8}
                  autoComplete="current-password"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={startingTotp}
                  style={{ marginTop: 8 }}
                >
                  {startingTotp ? "Preparing…" : "Set up authenticator"}
                </button>
              </form>
            ) : (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupQr}
                  alt="Authenticator QR code"
                  width={200}
                  height={200}
                  style={{ border: "1px solid #ccc" }}
                />
                <p style={{ fontSize: 12, wordBreak: "break-all" }}>
                  Or enter this key manually:{" "}
                  <code>{setupSecret}</code>
                </p>
                <form action={confirmTotp}>
                  <CsrfField token={csrf} />
                  <label className="label" htmlFor="totp-confirm-code">
                    Code from your app
                  </label>
                  <input
                    id="totp-confirm-code"
                    name="code"
                    className="field"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={confirmingTotp}
                    style={{ marginTop: 8 }}
                  >
                    {confirmingTotp ? "Checking…" : "Confirm and turn on"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
