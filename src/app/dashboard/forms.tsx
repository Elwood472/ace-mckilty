"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  createListEmailInvite,
  decideAccessRequest,
  requestListAccessByEmail,
  type ActionState,
} from "@/app/actions/access";
import { createTogetherList } from "@/app/actions/lists";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

const HOME_INVITE_FLASH_KEY = "ace-home-invite-flash";

function readHomeInviteFlash(): { ok?: string; error?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(HOME_INVITE_FLASH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { ok?: string; error?: string };
    return {
      ok: typeof parsed.ok === "string" ? parsed.ok : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return {};
  }
}

function writeHomeInviteFlash(next: { ok?: string; error?: string }) {
  try {
    if (!next.ok && !next.error) sessionStorage.removeItem(HOME_INVITE_FLASH_KEY);
    else sessionStorage.setItem(HOME_INVITE_FLASH_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function InviteMyListForm({
  csrf,
  listId,
}: {
  csrf: string;
  listId: string;
}) {
  const [state, action, pending] = useActionState(createListEmailInvite, initial);
  // Survive dashboard remounts so the green “Invite emailed to …” stays visible.
  const [flash, setFlash] = useState<{ ok?: string; error?: string }>({});
  useEffect(() => {
    setFlash(readHomeInviteFlash());
  }, []);
  useEffect(() => {
    if (state.ok) {
      const next = { ok: state.ok };
      setFlash(next);
      writeHomeInviteFlash(next);
    } else if (state.error) {
      const next = { error: state.error };
      setFlash(next);
      writeHomeInviteFlash(next);
    }
  }, [state.ok, state.error]);

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={() => {
        setFlash({});
        writeHomeInviteFlash({});
      }}
    >
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <Flash error={flash.error} ok={flash.ok} />
      <label className="label" htmlFor="invite-email">
        Friend&apos;s email
      </label>
      <input
        id="invite-email"
        name="email"
        type="email"
        className="field"
        required
        placeholder="friend@example.com"
      />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Email invite link"}
      </button>
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Sends an email with an invite link. Look for the green confirmation
        above when it goes out.
      </p>
    </form>
  );
}

export function FindByEmailForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(
    requestListAccessByEmail,
    initial as ActionState & { listId?: string },
  );

  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />
      <label className="label" htmlFor="find-email">
        Their email (exact match)
      </label>
      <input
        id="find-email"
        name="email"
        type="email"
        className="field"
        required
        placeholder="friend@example.com"
        autoComplete="email"
      />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Request access"}
      </button>
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Exact email only — no name search. We won&apos;t say whether that email
        has an account; if it does, they must approve your request.
      </p>
      {"listId" in state && state.listId ? (
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          <Link href={`/lists/${state.listId}`}>Open their list</Link>
        </p>
      ) : null}
    </form>
  );
}

export function DecideRequestForm({
  csrf,
  requestId,
}: {
  csrf: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(decideAccessRequest, initial);
  return (
    <div>
      <Flash error={state.error} ok={state.ok} />
      <form action={action} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="approve" />
        <button type="submit" className="btn" disabled={pending} style={{ marginRight: 6 }}>
          Approve
        </button>
      </form>
      <form action={action} style={{ display: "inline" }}>
        <CsrfField token={csrf} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value="deny" />
        <button type="submit" className="btn" disabled={pending}>
          Deny
        </button>
      </form>
    </div>
  );
}

export function CreateTogetherForm({
  csrf,
  candidates,
}: {
  csrf: string;
  candidates: { id: string; display_name: string }[];
}) {
  const [state, action, pending] = useActionState(createTogetherList, initial);
  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <Flash error={state.error} />
      <label className="label" htmlFor="together-title">
        Title
      </label>
      <input
        id="together-title"
        name="title"
        className="field"
        required
        maxLength={120}
        placeholder="Mom & Dad — shared list"
      />
      <label className="label" htmlFor="anniversary">
        Anniversary (optional)
      </label>
      <input id="anniversary" name="anniversary" type="date" className="field" />
      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
        Shared list for a couple or group gift. Anniversary is optional metadata —
        not a home directory.
      </p>
      <fieldset style={{ border: "1px solid #ccc", padding: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 700 }}>Also owns this list</legend>
        {candidates.length === 0 ? (
          <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
            Invite or approve someone first, then add them as a co-owner.
          </p>
        ) : (
          candidates.map((c) => (
            <label
              key={c.id}
              style={{ display: "block", fontSize: 13, marginBottom: 4 }}
            >
              <input type="checkbox" name="ownerIds" value={c.id} /> {c.display_name}
            </label>
          ))
        )}
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create together list"}
      </button>
    </form>
  );
}
