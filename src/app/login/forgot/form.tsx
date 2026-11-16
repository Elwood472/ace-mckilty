"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  requestPasswordResetAction,
  type PasswordResetState,
} from "@/app/actions/password-reset";
import { CsrfField } from "@/components/csrf-field";
import { TurnstileField } from "@/components/turnstile-field";
import type { MathChallenge } from "@/lib/captcha";

const initial: PasswordResetState = {};

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function solvePow(salt: string, difficulty: number): Promise<string> {
  const prefix = "0".repeat(Math.max(1, Math.min(8, difficulty)));
  let n = 0;
  while (true) {
    for (let i = 0; i < 200; i += 1) {
      const nonce = String(n++);
      const hex = await sha256Hex(`${salt}:${nonce}`);
      if (hex.startsWith(prefix)) return nonce;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function ForgotPasswordForm({
  csrf,
  turnstileSiteKey,
  mathChallenge,
}: {
  csrf: string;
  turnstileSiteKey: string | null;
  mathChallenge: MathChallenge | null;
}) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initial,
  );
  const issuedAt = useMemo(() => String(Date.now()), []);
  const [powNonce, setPowNonce] = useState("");
  const [powReady, setPowReady] = useState(!mathChallenge);

  useEffect(() => {
    if (!mathChallenge) {
      setPowReady(true);
      return;
    }
    let cancelled = false;
    setPowReady(false);
    setPowNonce("");
    void (async () => {
      const nonce = await solvePow(
        mathChallenge.powSalt,
        mathChallenge.powDifficulty,
      );
      if (!cancelled) {
        setPowNonce(nonce);
        setPowReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mathChallenge]);

  return (
    <form
      action={formAction}
      className="panel"
      style={{ padding: 16, maxWidth: 360, width: "100%" }}
    >
      <CsrfField token={csrf} />
      <input type="hidden" name="form_issued_at" value={issuedAt} />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label htmlFor="company_website">Company website</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="label" htmlFor="email">
          Account email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          required
          autoComplete="email"
          autoFocus
        />
      </div>
      {turnstileSiteKey ? (
        <TurnstileField siteKey={turnstileSiteKey} />
      ) : mathChallenge ? (
        <div style={{ marginBottom: 12 }}>
          <input type="hidden" name="captcha_token" value={mathChallenge.token} />
          <input
            type="hidden"
            name="captcha_pow_salt"
            value={mathChallenge.powSalt}
          />
          <input type="hidden" name="captcha_pow_nonce" value={powNonce} />
          <label className="label" htmlFor="captcha_answer">
            {mathChallenge.prompt}
          </label>
          <input
            id="captcha_answer"
            name="captcha_answer"
            className="field"
            required
            inputMode="numeric"
            autoComplete="off"
          />
          {!powReady ? (
            <p style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              Preparing security check…
            </p>
          ) : null}
        </div>
      ) : null}
      {state.error ? (
        <p style={{ color: "#cc0000", fontWeight: 700 }}>{state.error}</p>
      ) : null}
      {state.ok ? (
        <p style={{ color: "#060", fontWeight: 700 }}>{state.ok}</p>
      ) : null}
      {state.stubResetUrl ? (
        <p style={{ fontSize: 12, color: "#555" }}>
          Local stub link:{" "}
          <Link href={state.stubResetUrl}>{state.stubResetUrl}</Link>
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending || (!!mathChallenge && !powReady)}
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        <Link href="/login">← Back to login</Link>
      </p>
    </form>
  );
}
