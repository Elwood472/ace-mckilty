import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ProfileEditForm } from "./form";

export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();

  const rows = await sql<{
    display_name: string;
    email: string;
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
  }>(
    `select display_name, email, birthday::text as birthday, picture_url, caption,
            height, shoe_size, pants_size, shirt_size, favorite_color, favorite_quote,
            heroes, wishes, favorite_food, favorite_movie, notes
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
        <h1 className="brand-title" style={{ fontSize: 20, marginTop: 8 }}>
          My Profile
        </h1>
        <ProfileEditForm csrf={csrf} initial={rows[0]} email={user.email} />
      </main>
    </>
  );
}
