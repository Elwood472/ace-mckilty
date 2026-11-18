"use client";

import { useActionState, useState } from "react";
import {
  updateAppearance,
  type ActionState,
} from "@/app/actions/appearance";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  type UserTheme,
} from "@/lib/theme";

const initial: ActionState = {};

export function AppearanceForm({
  csrf,
  initialTheme,
}: {
  csrf: string;
  initialTheme: UserTheme;
}) {
  const [state, action, pending] = useActionState(updateAppearance, initial);
  const [accent, setAccent] = useState(initialTheme.accent);
  const [page, setPage] = useState(initialTheme.page);
  const [link, setLink] = useState(initialTheme.link);

  return (
    <form action={action} className="space-y-4" style={{ maxWidth: 420 }}>
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />

      <div>
        <div className="label" style={{ marginBottom: 6 }}>
          Presets
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="submit"
              name="preset"
              value={p.id}
              className="btn"
              disabled={pending}
              onClick={() => {
                setAccent(p.theme.accent);
                setPage(p.theme.page);
                setLink(p.theme.link);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="label" htmlFor="accent">
        Accent (headers &amp; buttons)
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="accent"
          name="accent"
          type="color"
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          style={{ width: 48, height: 32, padding: 0, border: "1px solid #666" }}
        />
        <input
          className="field"
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          pattern="#[0-9A-Fa-f]{6}"
          maxLength={7}
          aria-label="Accent hex"
        />
      </div>

      <label className="label" htmlFor="page">
        Page background
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="page"
          name="page"
          type="color"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          style={{ width: 48, height: 32, padding: 0, border: "1px solid #666" }}
        />
        <input
          className="field"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          pattern="#[0-9A-Fa-f]{6}"
          maxLength={7}
          aria-label="Page hex"
        />
      </div>

      <label className="label" htmlFor="link">
        Link text
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="link"
          name="link"
          type="color"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          style={{ width: 48, height: 32, padding: 0, border: "1px solid #666" }}
        />
        <input
          className="field"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          pattern="#[0-9A-Fa-f]{6}"
          maxLength={7}
          aria-label="Link hex"
        />
      </div>

      <div
        style={{
          marginTop: 8,
          padding: 12,
          border: "1px solid var(--border-soft)",
          background: page,
        }}
      >
        <div
          style={{
            background: accent,
            color: "#fff",
            fontWeight: 700,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          Preview header
        </div>
        <a href="#preview" style={{ color: link, fontWeight: 700 }}>
          Sample link
        </a>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save colors"}
        </button>
        <button
          type="submit"
          name="preset"
          value="reset"
          className="btn"
          disabled={pending}
          onClick={() => {
            setAccent(DEFAULT_THEME.accent);
            setPage(DEFAULT_THEME.page);
            setLink(DEFAULT_THEME.link);
          }}
        >
          Reset to classic
        </button>
      </div>
    </form>
  );
}
