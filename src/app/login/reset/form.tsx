"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  completePasswordResetAction,
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

export function ResetPasswordForm({
  csrf,
  token,
  turnstileSiteKey,
  mathChallenge,
}: {
  csrf: string;
  token: string;
  turnstileSiteKey: string | null;
  mathChallenge: MathChallenge | null;
}) {
  const [state, formAction, pending] = useActionState(
    completePasswordResetAction,
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
      <input type="hidden" name="token" value={token} />
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
      {turnstileSiteKey ? (
        <TurnstileField siteKey={turnstileSiteKey} />
      ) : mathChallenge ? (
        <>
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
        </>
      ) : null}
      {state.error ? (
        <p style={{ color: "#cc0000", fontWeight: 700 }}>{state.error}</p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={
          pending || (!turnstileSiteKey && !mathChallenge) || !powReady
        }
      >
        {pending ? "Saving…" : "Save new password"}
      </button>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        <Link href="/login">← Back to login</Link>
      </p>
    </form>
  );
}
