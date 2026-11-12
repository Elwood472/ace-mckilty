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

  function field(
    label: string,
    name: string,
    value: string,
    opts?: { type?: string; alt?: "a" | "b" },
  ) {
    const alt = opts?.alt ?? "a";
    return (
      <tr>
        <td className={alt === "a" ? "alt-a" : "alt-b"} style={{ width: 180, fontWeight: 700 }}>
          {label}
        </td>
        <td className={alt === "a" ? "alt-a" : "alt-b"}>
          <input
            className="field"
            name={name}
            type={opts?.type ?? "text"}
            defaultValue={value}
          />
        </td>
      </tr>
    );
  }

  return (
    <form action={action} style={{ maxWidth: 560, marginTop: 8 }}>
      <CsrfField token={csrf} />
      <Flash error={state.error} ok={state.ok} />
      <table className="profile-table" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td className="sec-head" colSpan={2}>
              My Profile
            </td>
          </tr>
          <tr>
            <td className="alt-a" style={{ fontWeight: 700 }}>
              E-mail
            </td>
            <td className="alt-a">{email}</td>
          </tr>
          {field("Display name", "displayName", data.display_name, { alt: "b" })}
          {field("Birthday", "birthday", data.birthday?.slice(0, 10) ?? "", {
            type: "date",
            alt: "a",
          })}
          {field("New password", "password", "", { type: "password", alt: "b" })}
          {field("Confirm password", "confirmPassword", "", {
            type: "password",
            alt: "a",
          })}
          {field("Picture URL", "pictureUrl", data.picture_url, { alt: "b" })}
          {field("Picture caption", "caption", data.caption, { alt: "a" })}
          <tr>
            <td className="size-head" colSpan={2}>
              Sizes
            </td>
          </tr>
          {field("Height", "height", data.height, { alt: "a" })}
          {field("Shoe size", "shoeSize", data.shoe_size, { alt: "b" })}
          {field("Pants size", "pantsSize", data.pants_size, { alt: "a" })}
          {field("Shirt size", "shirtSize", data.shirt_size, { alt: "b" })}
          <tr>
            <td className="sec-head" colSpan={2}>
              Miscellaneous
            </td>
          </tr>
          {field("Favorite color", "favoriteColor", data.favorite_color, { alt: "a" })}
          {field("Favorite quote", "favoriteQuote", data.favorite_quote, { alt: "b" })}
          {field("Heroes/Role models", "heroes", data.heroes, { alt: "a" })}
          {field("Three wishes", "wishes", data.wishes, { alt: "b" })}
          {field("Favorite food", "favoriteFood", data.favorite_food, { alt: "a" })}
          {field("Favorite movie", "favoriteMovie", data.favorite_movie, { alt: "b" })}
          <tr>
            <td className="alt-a" style={{ fontWeight: 700 }}>
              Notes
            </td>
            <td className="alt-a">
              <textarea className="field" name="notes" rows={4} defaultValue={data.notes} />
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </p>
    </form>
  );
}
