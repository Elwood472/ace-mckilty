"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { updateProfile, type ActionState } from "@/app/actions/profile";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";
import {
  PROFILE_ENTERTAINMENT,
  PROFILE_FOOD,
  PROFILE_MISC,
  PROFILE_PIVOT,
  type ProfileField,
} from "@/lib/profile-fields";

const initial: ActionState = {};

export type ProfileInitial = {
  display_name: string;
  birthday: string | null;
  picture_url: string;
  caption: string;
  height: string;
  shoe_size: string;
  pants_size: string;
  shirt_size: string;
  [key: string]: string | null;
};

type TabId = "basics" | "about" | "food" | "entertainment" | "pivot";

const TABS: { id: TabId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "about", label: "About you" },
  { id: "food", label: "Food" },
  { id: "entertainment", label: "Entertainment" },
  { id: "pivot", label: "Bernard Pivot" },
];

const toolbarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  background: "#fff",
  border: "1px solid #000",
  marginBottom: 12,
  padding: 10,
};

const tabRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 10px",
    border: active ? "1px solid #000066" : "1px solid #666",
    background: active ? "#000080" : "#f0f0f0",
    color: active ? "#fff" : "#000",
    cursor: "pointer",
  };
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="label">{label}</span>
      <input
        id={name}
        className="field"
        name={name}
        type={type}
        defaultValue={defaultValue}
      />
      {hint ? (
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#555" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Area({
  field,
  data,
}: {
  field: ProfileField;
  data: ProfileInitial;
}) {
  const value = String(data[field.column] ?? "");
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="label">{field.label}</span>
      <textarea
        id={field.key}
        className="field"
        name={field.key}
        rows={3}
        defaultValue={value}
      />
      {field.hint ? (
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#555" }}>
          {field.hint}
        </span>
      ) : null}
    </label>
  );
}

function QuestionList({
  fields,
  data,
}: {
  fields: ProfileField[];
  data: ProfileInitial;
}) {
  return (
    <div style={{ padding: 16 }}>
      {fields.map((f) => (
        <Area key={f.key} field={f} data={data} />
      ))}
    </div>
  );
}

export function ProfileEditForm({
  csrf,
  initial: data,
  email,
}: {
  csrf: string;
  initial: ProfileInitial;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const [tab, setTab] = useState<TabId>("basics");

  return (
    <form action={action} style={{ maxWidth: 720, marginTop: 12 }}>
      <CsrfField token={csrf} />

      {/* Sticky save + tabs — visible without scrolling */}
      <div style={toolbarStyle}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </button>
          <Flash error={state.error} ok={state.ok} />
        </div>
        <div style={tabRowStyle} role="tablist" aria-label="Profile sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`profile-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`profile-panel-${t.id}`}
              style={tabStyle(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keep every field in the DOM so Save submits all tabs */}
      <div
        id="profile-panel-basics"
        role="tabpanel"
        aria-labelledby="profile-tab-basics"
        hidden={tab !== "basics"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Account</div>
        <div style={{ padding: 16 }}>
          <p style={{ marginTop: 0, color: "#555" }}>
            Signed in as <b>{email}</b>
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Field
              label="Display name"
              name="displayName"
              defaultValue={data.display_name}
            />
            <Field
              label="Birthday"
              name="birthday"
              type="date"
              defaultValue={data.birthday?.slice(0, 10) ?? ""}
            />
            <Field
              label="New password"
              name="password"
              type="password"
              defaultValue=""
              hint="Leave blank to keep current password"
            />
            <Field
              label="Confirm password"
              name="confirmPassword"
              type="password"
              defaultValue=""
            />
          </div>
        </div>

        <div className="panel-head">Photo</div>
        <div style={{ padding: 16 }}>
          <Field
            label="Picture URL"
            name="pictureUrl"
            defaultValue={data.picture_url}
            hint="Paste a link to an image"
          />
          <Field label="Caption" name="caption" defaultValue={data.caption} />
        </div>

        <div className="panel-head">Sizes</div>
        <div
          style={{
            padding: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field label="Height" name="height" defaultValue={data.height} />
          <Field label="Shoe size" name="shoeSize" defaultValue={data.shoe_size} />
          <Field label="Pants size" name="pantsSize" defaultValue={data.pants_size} />
          <Field label="Shirt size" name="shirtSize" defaultValue={data.shirt_size} />
        </div>
      </div>

      <div
        id="profile-panel-about"
        role="tabpanel"
        aria-labelledby="profile-tab-about"
        hidden={tab !== "about"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">About you</div>
        <QuestionList fields={PROFILE_MISC} data={data} />
      </div>

      <div
        id="profile-panel-food"
        role="tabpanel"
        aria-labelledby="profile-tab-food"
        hidden={tab !== "food"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Food favorites</div>
        <QuestionList fields={PROFILE_FOOD} data={data} />
      </div>

      <div
        id="profile-panel-entertainment"
        role="tabpanel"
        aria-labelledby="profile-tab-entertainment"
        hidden={tab !== "entertainment"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Entertainment & sports</div>
        <QuestionList fields={PROFILE_ENTERTAINMENT} data={data} />
      </div>

      <div
        id="profile-panel-pivot"
        role="tabpanel"
        aria-labelledby="profile-tab-pivot"
        hidden={tab !== "pivot"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Bernard Pivot wants to know…</div>
        <QuestionList fields={PROFILE_PIVOT} data={data} />
      </div>
    </form>
  );
}
