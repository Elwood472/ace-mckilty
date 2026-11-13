"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  createListEmailInvite,
  decideAccessRequest,
  requestListAccess,
  searchPeopleAction,
  type ActionState,
} from "@/app/actions/access";
import { createTogetherList } from "@/app/actions/lists";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function InviteMyListForm({
  csrf,
  listId,
}: {
  csrf: string;
  listId: string;
}) {
  const [state, action, pending] = useActionState(createListEmailInvite, initial);
  return (
    <form action={action} className="space-y-2">
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <Flash error={state.error} ok={state.ok} />
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
        {pending ? "Sending…" : "Email magic invite link"}
      </button>
    </form>
  );
}

type Hit = {
  id: string;
  display_name: string;
  email: string;
  personal_list_id: string | null;
  has_access: boolean;
  pending_request: boolean;
};

export function SearchPeoplePanel({ csrf }: { csrf: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();
  const [reqState, reqAction, reqPending] = useActionState(
    requestListAccess,
    initial,
  );

  return (
    <div>
      <label className="label" htmlFor="people-q">
        Search by name or email
      </label>
      <input
        id="people-q"
        className="field"
        value={q}
        placeholder="Start typing…"
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          start(async () => {
            if (v.trim().length < 2) {
              setHits([]);
              return;
            }
            setHits(await searchPeopleAction(v));
          });
        }}
      />
      {pending ? (
        <p style={{ fontSize: 12, color: "#555" }}>Searching…</p>
      ) : null}
      <Flash error={reqState.error} ok={reqState.ok} />
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
        {hits.map((h) => (
          <li
            key={h.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <div>
              <Link href={`/profile/${h.id}`} style={{ fontWeight: 600 }}>
                {h.display_name}
              </Link>
              <div style={{ fontSize: 12, color: "#555" }}>{h.email}</div>
            </div>
            <div>
              {h.has_access && h.personal_list_id ? (
                <Link href={`/lists/${h.personal_list_id}`} className="btn">
                  Open list
                </Link>
              ) : h.pending_request ? (
                <span style={{ fontSize: 12, color: "#555" }}>Pending</span>
              ) : h.personal_list_id ? (
                <form action={reqAction}>
                  <CsrfField token={csrf} />
                  <input type="hidden" name="listId" value={h.personal_list_id} />
                  <input type="hidden" name="ownerUserId" value={h.id} />
                  <button type="submit" className="btn" disabled={reqPending}>
                    Request access
                  </button>
                </form>
              ) : (
                <span style={{ fontSize: 12, color: "#555" }}>No list</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
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
