"use client";

import { useActionState } from "react";
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

function Section({
  title,
  fields,
  data,
}: {
  title: string;
  fields: ProfileField[];
  data: ProfileInitial;
}) {
  return (
    <section className="panel" style={{ width: "100%", marginBottom: 16 }}>
      <div className="panel-head">{title}</div>
      <div style={{ padding: 16 }}>
        {fields.map((f) => (
          <Area key={f.key} field={f} data={data} />
        ))}
      </div>
    </section>
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

  return (
    <form action={action} style={{ maxWidth: 720, marginTop: 12 }}>
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />

      <section className="panel" style={{ width: "100%", marginBottom: 16 }}>
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
      </section>

      <section className="panel" style={{ width: "100%", marginBottom: 16 }}>
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
      </section>

      <section className="panel" style={{ width: "100%", marginBottom: 16 }}>
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
      </section>

      <Section title="Misc" fields={PROFILE_MISC} data={data} />
      <Section title="Food Favorites" fields={PROFILE_FOOD} data={data} />
      <Section
        title="Entertainment & Sports Favorites"
        fields={PROFILE_ENTERTAINMENT}
        data={data}
      />
      <Section title="Bernard Pivot Wants To Know..." fields={PROFILE_PIVOT} data={data} />

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
