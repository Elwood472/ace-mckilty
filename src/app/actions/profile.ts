"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ALL_QUESTIONNAIRE } from "@/lib/profile-fields";
import { destroyOtherSessions } from "@/lib/session";
import { normalizeStoredHttpUrl } from "@/lib/url-safety";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const displayName = s(formData, "displayName");
    if (!displayName) return { error: "Display name is required." };

    const birthday = s(formData, "birthday") || null;
    const password = s(formData, "password");
    const confirm = s(formData, "confirmPassword");
    const currentPassword = s(formData, "currentPassword");
    if (password || confirm) {
      if (password.length < 8) return { error: "Password must be 8+ characters." };
      if (password !== confirm) return { error: "Passwords did not match." };
      if (!currentPassword) {
        return { error: "Enter your current password to set a new one." };
      }
      const rows = await sql<{ password_hash: string }>(
        "select password_hash from users where id = $1",
        [user.id],
      );
      if (
        !rows.length ||
        !(await verifyPassword(currentPassword, rows[0].password_hash))
      ) {
        return { error: "Current password is incorrect." };
      }
      const hash = await hashPassword(password);
      await sql("update users set password_hash = $1 where id = $2", [
        hash,
        user.id,
      ]);
      await destroyOtherSessions(user.id);
    }

    const sets: string[] = [
      "display_name = $1",
      "birthday = $2",
      "picture_url = $3",
      "caption = $4",
      "height = $5",
      "shoe_size = $6",
      "pants_size = $7",
      "shirt_size = $8",
      "profile_modified_at = now()",
    ];
    const pictureRaw = s(formData, "pictureUrl");
    const pictureUrl = pictureRaw ? normalizeStoredHttpUrl(pictureRaw) : "";
    if (pictureRaw && !pictureUrl) {
      return { error: "Picture URL must be a public http(s) link." };
    }

    const params: unknown[] = [
      displayName,
      birthday,
      pictureUrl,
      s(formData, "caption"),
      s(formData, "height"),
      s(formData, "shoeSize"),
      s(formData, "pantsSize"),
      s(formData, "shirtSize"),
    ];

    for (const field of ALL_QUESTIONNAIRE) {
      params.push(s(formData, field.key));
      sets.push(`${field.column} = $${params.length}`);
    }

    params.push(user.id);
    await sql(
      `update users set ${sets.join(", ")} where id = $${params.length}`,
      params,
    );

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    revalidatePath(`/profile/${user.id}`);
    revalidatePath("/profile/edit");
    return { ok: "Profile saved." };
  } catch {
    return { error: "Could not save profile." };
  }
}
