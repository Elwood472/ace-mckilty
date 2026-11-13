import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canViewList } from "@/lib/authz";
import { getPersonalListId } from "@/lib/lists";
import { formatMdY } from "@/lib/dates";
import { RequestAccessButton } from "./request-access";

type Props = { params: Promise<{ userId: string }> };

type Profile = {
  id: string;
  display_name: string;
  email: string;
  birthday: string | null;
  profile_modified_at: string | null;
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

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const rows = await sql<Profile>(
    `select id, display_name, email, birthday::text as birthday,
            profile_modified_at::text as profile_modified_at,
            picture_url, caption, height, shoe_size, pants_size, shirt_size,
            favorite_color, favorite_quote, heroes, wishes,
            favorite_food, favorite_movie, notes
     from users where id = $1`,
    [userId],
  );
  if (!rows.length) notFound();
  const p = rows[0];

  const theirListId = await getPersonalListId(userId);
  const csrf = await ensureCsrfToken();
  let access: "self" | "granted" | "pending" | "none" = "none";
  if (userId === me.id) access = "self";
  else if (theirListId && (await canViewList(theirListId, me.id))) {
    access = "granted";
  } else if (theirListId) {
    const pending = await sql(
      `select 1 from list_access_requests
       where list_id = $1 and requester_id = $2 and status = 'pending'`,
      [theirListId, me.id],
    );
    access = pending.length ? "pending" : "none";
  }

  function row(label: string, value: string, alt: "a" | "b") {
    return (
      <tr>
        <td className={alt === "a" ? "alt-a" : "alt-b"} style={{ width: 180, fontWeight: 700 }}>
          {label}
        </td>
        <td className={alt === "a" ? "alt-a" : "alt-b"}>{value || "\u00a0"}</td>
      </tr>
    );
  }

  return (
    <>
      <SiteHeader user={me} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {userId === me.id ? (
            <>
              {" · "}
              <Link href="/profile/edit">Edit My Profile</Link>
            </>
          ) : null}
          {access === "granted" && theirListId ? (
            <>
              {" · "}
              <Link href={`/lists/${theirListId}`}>View wish list</Link>
            </>
          ) : null}
        </p>

        {access === "none" && theirListId ? (
          <div className="panel" style={{ maxWidth: 560, marginTop: 8, marginBottom: 12 }}>
            <div className="panel-head">Wish list access</div>
            <div style={{ padding: 10 }}>
              <p style={{ marginTop: 0 }}>
                You don&apos;t have access to {p.display_name}&apos;s list yet.
              </p>
              <RequestAccessButton
                csrf={csrf}
                listId={theirListId}
                ownerUserId={userId}
              />
            </div>
          </div>
        ) : null}
        {access === "pending" ? (
          <p style={{ color: "#555" }}>Access request pending approval.</p>
        ) : null}

        <table className="profile-table" cellPadding={0} cellSpacing={0} style={{ maxWidth: 560, marginTop: 8 }}>
          <tbody>
            <tr>
              <td className="sec-head" colSpan={2}>
                {p.display_name}&apos;s Profile
              </td>
            </tr>
            {row("Last Modified", p.profile_modified_at ? formatMdY(p.profile_modified_at) : "—", "a")}
            {row("Name", p.display_name, "b")}
            {row("E-mail", p.email, "a")}
            {row("Birthday", p.birthday ? formatMdY(p.birthday) : "—", "b")}
            {p.picture_url ? (
              <tr>
                <td className="alt-a" colSpan={2}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.picture_url}
                    alt=""
                    width={320}
                    style={{ border: "6px solid #666", maxWidth: "100%" }}
                  />
                </td>
              </tr>
            ) : null}
            {p.caption ? (
              <tr>
                <td className="alt-b" colSpan={2} style={{ fontStyle: "italic" }}>
                  {p.caption}
                </td>
              </tr>
            ) : null}
            <tr>
              <td className="size-head" colSpan={2}>
                Sizes
              </td>
            </tr>
            <tr>
              <td className="size-a" style={{ fontWeight: 700 }}>
                Height
              </td>
              <td className="size-a">{p.height || "\u00a0"}</td>
            </tr>
            <tr>
              <td className="size-a" style={{ fontWeight: 700 }}>
                Shoe Size
              </td>
              <td className="size-a">{p.shoe_size || "\u00a0"}</td>
            </tr>
            <tr>
              <td className="size-b" style={{ fontWeight: 700 }}>
                Pants Size
              </td>
              <td className="size-b">{p.pants_size || "\u00a0"}</td>
            </tr>
            <tr>
              <td className="size-a" style={{ fontWeight: 700 }}>
                Shirt Size
              </td>
              <td className="size-a">{p.shirt_size || "\u00a0"}</td>
            </tr>
            <tr>
              <td className="sec-head" colSpan={2}>
                Miscellaneous
              </td>
            </tr>
            {row("Favorite Color", p.favorite_color, "a")}
            {row("Favorite Quote", p.favorite_quote, "b")}
            {row("Heroes/Role Models", p.heroes, "a")}
            {row("Three Wishes", p.wishes, "b")}
            {row("Favorite Food", p.favorite_food, "a")}
            {row("Favorite Movie", p.favorite_movie, "b")}
            {row("Notes", p.notes, "a")}
          </tbody>
        </table>
      </main>
    </>
  );
}
