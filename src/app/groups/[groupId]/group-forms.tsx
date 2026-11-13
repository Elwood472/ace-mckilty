"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addMemberById,
  createEmailInvite,
  leaveGroup,
  removeMember,
  searchUsers,
  type ActionState,
} from "@/app/actions/groups";
import { createTogetherList } from "@/app/actions/lists";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

export function TogetherListForm({
  csrf,
  groupId,
  members,
}: {
  csrf: string;
  groupId: string;
  members: { id: string; display_name: string }[];
}) {
  const [state, action, pending] = useActionState(createTogetherList, initial);
  return (
    <form action={action} className="mt-4 space-y-3">
      <CsrfField token={csrf} />
      <input type="hidden" name="groupId" value={groupId} />
      <Flash error={state.error} />
      <label className="label" htmlFor="title">
        Title
      </label>
      <input
        id="title"
        name="title"
        className="field"
        placeholder="Mom & Dad — shared list"
        required
      />
      <label className="label" htmlFor="anniversary">
        Anniversary (optional)
      </label>
      <input id="anniversary" name="anniversary" type="date" className="field" />
      <fieldset>
        <legend className="label">Also owns this list</legend>
        <div
          className="max-h-40 space-y-1 overflow-auto p-2"
          style={{ border: "1px solid #000" }}
        >
          {members.length === 0 ? (
            <p>Invite others first.</p>
          ) : (
            members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ownerIds" value={m.id} />
                {m.display_name}
              </label>
            ))
          )}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create together list"}
      </button>
    </form>
  );
}

export function MemberRemoveForm({
  csrf,
  groupId,
  userId,
}: {
  csrf: string;
  groupId: string;
  userId: string;
}) {
  const [, action, pending] = useActionState(removeMember, initial);
  return (
    <form action={action}>
      <CsrfField token={csrf} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="text-xs font-semibold text-danger hover:underline"
        disabled={pending}
      >
        Remove
      </button>
    </form>
  );
}

export function LeaveForm({
  csrf,
  groupId,
}: {
  csrf: string;
  groupId: string;
}) {
  const [state, action, pending] = useActionState(leaveGroup, initial);
  return (
    <form action={action} className="mt-4">
      <CsrfField token={csrf} />
      <input type="hidden" name="groupId" value={groupId} />
      <Flash error={state.error} />
      <button type="submit" className="btn w-full text-sm" disabled={pending}>
        Leave circle
      </button>
    </form>
  );
}

export function InviteForms({
  csrf,
  groupId,
}: {
  csrf: string;
  groupId: string;
}) {
  const [state, action, pending] = useActionState(createEmailInvite, initial);
  return (
    <form action={action} className="mt-3 space-y-3">
      <CsrfField token={csrf} />
      <input type="hidden" name="groupId" value={groupId} />
      <Flash error={state.error} ok={state.ok} />
      <label className="label" htmlFor="email">
        Email invite
      </label>
      <input id="email" name="email" type="email" className="field" required />
      <button type="submit" className="btn w-full text-sm" disabled={pending}>
        {pending ? "Sending…" : "Email invite link"}
      </button>
      <p style={{ fontSize: 11, color: "#555", margin: 0 }}>
        Sends a magic invite link when email is configured (
        <code>RESEND_API_KEY</code>).
      </p>
    </form>
  );
}

export function UserSearchPanel({
  csrf,
  groupId,
}: {
  csrf: string;
  groupId: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; display_name: string; email: string; in_group: boolean }[]
  >([]);
  const [pendingSearch, startSearch] = useTransition();
  const [state, action, pendingAdd] = useActionState(addMemberById, initial);

  function onSearch(value: string) {
    setQ(value);
    startSearch(async () => {
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      const rows = await searchUsers(groupId, value);
      setResults(rows);
    });
  }

  return (
    <div className="mt-3 space-y-3">
      <Flash error={state.error} ok={state.ok} />
      <label className="label" htmlFor="search">
        Search by name or email
      </label>
      <input
        id="search"
        className="field"
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Start typing…"
      />
      {pendingSearch && <p className="text-xs text-muted">Searching…</p>}
      <ul className="space-y-2">
        {results.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 text-sm"
            style={{
              border: "1px solid #c0c0c0",
              padding: "6px 8px",
              background: "#fff",
            }}
          >
            <div>
              <p className="font-semibold">{r.display_name}</p>
              <p className="text-muted">{r.email}</p>
            </div>
            {r.in_group ? (
              <span className="text-xs" style={{ color: "#006600" }}>
                In circle
              </span>
            ) : (
              <form action={action}>
                <CsrfField token={csrf} />
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="userId" value={r.id} />
                <button
                  type="submit"
                  className="btn btn-primary py-1.5 text-xs"
                  disabled={pendingAdd}
                >
                  Add
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
