import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireAppUser } from "@/lib/session";
import { canViewList } from "@/lib/authz";
import { getPersonalListId } from "@/lib/lists";
import { formatMdY } from "@/lib/dates";
import { QUESTIONNAIRE_COLUMNS } from "@/lib/profile-fields";
import { RequestAccessButton } from "./request-access";
import { ProfileView, type ProfileViewData } from "./profile-view";

type Props = { params: Promise<{ userId: string }> };

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const me = await requireAppUser();

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

  const canSeePrivate = access === "self" || access === "granted";

  if (canSeePrivate) {
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

  // No list relationship: only public display name + access request UI.
  // Do not load or render email, birthday, sizes, or questionnaire answers.
  const publicRows = await sql<{ id: string; display_name: string }>(
    `select id, display_name from users where id = $1`,
    [userId],
  );
  if (!publicRows.length) notFound();
  const person = publicRows[0];

  return (
    <>
      <SiteHeader user={me} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
        </p>

        <h1 style={{ fontSize: 20, marginTop: 12 }}>{person.display_name}</h1>

        {access === "none" && theirListId ? (
          <div
            className="panel"
            style={{ maxWidth: 720, marginTop: 8, marginBottom: 12 }}
          >
            <div className="panel-head">Wish list access</div>
            <div style={{ padding: 10 }}>
              <p style={{ marginTop: 0 }}>
                You don&apos;t have access to {person.display_name}&apos;s list
                yet. Their profile stays private until they share with you.
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
          <p style={{ color: "#555" }}>
            Access request pending approval. Profile details stay private until
            then.
          </p>
        ) : null}
        {!theirListId ? (
          <p style={{ color: "#555" }}>This person has no personal list yet.</p>
        ) : null}
      </main>
    </>
  );
}
