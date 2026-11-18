import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireAppUser } from "@/lib/session";
import { canViewList } from "@/lib/authz";
import { isProvisionedAdmin } from "@/lib/admin";
import { getPersonalListId } from "@/lib/lists";
import { formatMdY } from "@/lib/dates";
import { QUESTIONNAIRE_COLUMNS } from "@/lib/profile-fields";
import { ProfileView, type ProfileViewData } from "./profile-view";

type Props = { params: Promise<{ userId: string }> };

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const me = await requireAppUser();

  const theirListId = await getPersonalListId(userId);
  await ensureCsrfToken();
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

  const canSeePrivate =
    access === "self" ||
    access === "granted" ||
    isProvisionedAdmin(me);

  // Strangers must not learn whether a UUID is a real account (or its name).
  // Request access by email on Home instead of probing /profile/{id}.
  if (!canSeePrivate) {
    if (access === "pending") {
      return (
        <>
          <SiteHeader user={me} />
          <main className="site-main">
            <p>
              <Link href="/dashboard">← Home</Link>
            </p>
            <p style={{ color: "#555", marginTop: 12 }}>
              Access request pending approval. Profile details stay private
              until then.
            </p>
          </main>
        </>
      );
    }
    notFound();
  }

  const qCols = QUESTIONNAIRE_COLUMNS.join(", ");
  const rows = await sql<ProfileViewData & { id: string }>(
    `select id, display_name, email, birthday::text as birthday,
            profile_modified_at::text as profile_modified_at,
            picture_url, caption, height, shoe_size, pants_size, shirt_size,
            ${qCols}
     from users where id = $1`,
    [userId],
  );
  if (!rows.length) notFound();
  const p = rows[0];

  return (
    <>
      <SiteHeader user={me} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {userId === me.id ? (
            <>
              {" · "}
              <Link href="/profile/edit">Edit profile</Link>
              {" · "}
              <Link href="/profile/appearance">Colors</Link>
            </>
          ) : null}
          {access === "granted" && theirListId ? (
            <>
              {" · "}
              <Link href={`/lists/${theirListId}`}>View wish list</Link>
            </>
          ) : null}
        </p>

        <ProfileView
          data={p}
          isSelf={userId === me.id}
          birthdayLabel={p.birthday ? formatMdY(p.birthday) : "—"}
          modifiedLabel={
            p.profile_modified_at ? formatMdY(p.profile_modified_at) : "—"
          }
        />
      </main>
    </>
  );
}
