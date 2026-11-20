"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          "timeout-callback"?: () => void;
        },
      ) => string;
      remove?: (id: string) => void;
      reset?: (id?: string) => void;
    };
    __turnstileOnLoad?: () => void;
  }
}

let scriptLoading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-ace-turnstile="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Turnstile script failed")),
      );
      return;
    }
    window.__turnstileOnLoad = () => resolve();
    const s = document.createElement("script");
    s.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__turnstileOnLoad";
    s.async = true;
    s.defer = true;
    s.dataset.aceTurnstile = "1";
    s.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(s);
  });
  return scriptLoading;
}

export function TurnstileField({
  siteKey,
  onReadyChange,
  resetSignal = 0,
}: {
  siteKey: string;
  /** Fires true when a token is ready; false while loading, expired, or errored. */
  onReadyChange?: (ready: boolean) => void;
  /** Bump to reset the widget (e.g. after a failed submit). */
  resetSignal?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onReadyRef = useRef(onReadyChange);
  onReadyRef.current = onReadyChange;

  useEffect(() => {
    let cancelled = false;
    onReadyRef.current?.(false);
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        // Managed mode often auto-passes (spin → green check) for real browsers.
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: "light",
          callback: () => onReadyRef.current?.(true),
          "expired-callback": () => onReadyRef.current?.(false),
          "error-callback": () => onReadyRef.current?.(false),
          "timeout-callback": () => onReadyRef.current?.(false),
        });
      })
      .catch(() => {
        // Server still rejects empty tokens.
        onReadyRef.current?.(false);
      });
    return () => {
      cancelled = true;
      onReadyRef.current?.(false);
      if (widgetId.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // ignore
        }
      }
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!resetSignal || !widgetId.current || !window.turnstile?.reset) return;
    try {
      window.turnstile.reset(widgetId.current);
      onReadyRef.current?.(false);
    } catch {
      // ignore
    }
  }, [resetSignal]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div ref={ref} />
      <p style={{ fontSize: 11, color: "#555", margin: "6px 0 0" }}>
        Cloudflare Turnstile checks that you&apos;re human. A brief spin and
        green check is normal — most people never need a puzzle. Submit stays
        disabled until that finishes.
      </p>
    </div>
  );
}
