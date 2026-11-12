"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signIn,
  signUp,
  type AuthState,
} from "@/app/actions/auth";
import { CsrfField } from "./csrf-field";

const initial: AuthState = {};

export function AuthForm({
  mode,
  csrf,
}: {
  mode: "signup" | "login";
  csrf: string;
}) {
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="surface fade-up-delay w-full max-w-md rounded-2xl p-8 shadow-[0_24px_60px_rgba(20,53,44,0.08)]">
      <CsrfField token={csrf} />
      {mode === "signup" && (
        <div className="mb-4">
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
      <div className="mb-4">
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
      <div className="mb-6">
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
      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>
      <p className="mt-5 text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-pine underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-pine underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
