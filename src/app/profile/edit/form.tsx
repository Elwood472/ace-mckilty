"use client";

import { useActionState } from "react";
import { updateProfile, type ActionState } from "@/app/actions/profile";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";

const initial: ActionState = {};

type Initial = {
  display_name: string;
  birthday: string | null;
  picture_url: string;
  caption: string;
  height: string;
  shoe_size: string;
  pants_size: string;
  shirt_size: string;
  favorite_color: string;
  favorite_quote: string;
  heroes: string;
  wishes: string;
  favorite_food: string;
  favorite_movie: string;
  notes: string;
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

export function ProfileEditForm({
  csrf,
  initial: data,
  email,
}: {
  csrf: string;
  initial: Initial;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);

  return (
    <form action={action} style={{ maxWidth: 640, marginTop: 12 }}>
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
            <Field label="Display name" name="displayName" defaultValue={data.display_name} />
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

      <section className="panel" style={{ width: "100%", marginBottom: 16 }}>
        <div className="panel-head">About you</div>
        <div style={{ padding: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Field
              label="Favorite color"
              name="favoriteColor"
              defaultValue={data.favorite_color}
            />
            <Field
              label="Favorite food"
              name="favoriteFood"
              defaultValue={data.favorite_food}
            />
            <Field
              label="Favorite movie"
              name="favoriteMovie"
              defaultValue={data.favorite_movie}
            />
            <Field
              label="Heroes / role models"
              name="heroes"
              defaultValue={data.heroes}
            />
          </div>
          <Field
            label="Favorite quote"
            name="favoriteQuote"
            defaultValue={data.favorite_quote}
          />
          <Field label="Three wishes" name="wishes" defaultValue={data.wishes} />
          <label style={{ display: "block", marginBottom: 14 }}>
            <span className="label">Notes</span>
            <textarea
              className="field"
              name="notes"
              rows={4}
              defaultValue={data.notes}
            />
          </label>
        </div>
      </section>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
