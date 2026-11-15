"use client";

import { useActionState, useMemo } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { CsrfField } from "@/components/csrf-field";
import { TurnstileField } from "@/components/turnstile-field";
import type { MathChallenge } from "@/lib/captcha";

const initial: AuthState = {};

export function AuthForm({
  mode,
  csrf,
  next,
  turnstileSiteKey,
  mathChallenge,
}: {
  mode: "signup" | "login";
  csrf: string;
  next?: string;
  turnstileSiteKey: string | null;
  mathChallenge: MathChallenge | null;
}) {
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction, pending] = useActionState(action, initial);
  const issuedAt = useMemo(() => String(Date.now()), []);

  return (
    <form
      action={formAction}
      className="panel"
      style={{ padding: 16, maxWidth: 360, width: "100%" }}
    >
      <CsrfField token={csrf} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="form_issued_at" value={issuedAt} />
      {/* Honeypot — leave empty */}
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
      {mode === "signup" && (
        <div style={{ marginBottom: 10 }}>
          <label className="label" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            className="field"
            required
            maxLength={80}
            autoComplete="name"
          />
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          required
          autoComplete="email"
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </div>

      {turnstileSiteKey ? (
        <TurnstileField siteKey={turnstileSiteKey} />
      ) : mathChallenge ? (
        <div style={{ marginBottom: 12 }}>
          <input type="hidden" name="captcha_token" value={mathChallenge.token} />
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
        </div>
      ) : null}

      {state.error && (
        <p style={{ color: "#cc0000", fontWeight: 700 }}>{state.error}</p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Log In"}
      </button>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
