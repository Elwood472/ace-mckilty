import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { QUESTIONNAIRE_COLUMNS } from "@/lib/profile-fields";
import { ProfileEditForm, type ProfileInitial } from "./form";

export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();

  const qCols = QUESTIONNAIRE_COLUMNS.join(", ");
  const rows = await sql<ProfileInitial>(
    `select display_name, birthday::text as birthday, picture_url, caption,
            height, shoe_size, pants_size, shirt_size, ${qCols}
     from users where id = $1`,
    [user.id],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {" · "}
          <Link href={`/profile/${user.id}`}>View profile</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          Edit profile
        </h1>
        <p style={{ color: "#555", maxWidth: 560 }}>
          Keep your birthday up to date so friends see you in the right order on
          the home page. The questionnaire below matches the old Ace McKilty
          profile form.
        </p>
        <ProfileEditForm csrf={csrf} initial={rows[0]} email={user.email} />
      </main>
    </>
  );
}
