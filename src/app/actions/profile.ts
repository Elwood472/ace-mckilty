"use server";

import { revalidatePath } from "next/cache";
import { touchLastActive } from "@/lib/activity";
import { sql } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ALL_QUESTIONNAIRE } from "@/lib/profile-fields";
import { destroyOtherSessions } from "@/lib/session";
import {
  deleteProfilePhoto,
  detectProfilePhotoType,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_LABEL,
  PROFILE_PHOTO_TYPES,
  profilePhotoPath,
  upsertProfilePhoto,
} from "@/lib/profile-photo";
import { DISPLAY_NAME_MAX, sanitizePublicLabel } from "@/lib/text";
import {
  normalizeStoredHttpUrl,
  safeProfilePictureSrc,
} from "@/lib/url-safety";

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
    const displayName = sanitizePublicLabel(
      s(formData, "displayName"),
      DISPLAY_NAME_MAX,
    );
    if (!displayName) {
      return {
        error: `Display name is required (max ${DISPLAY_NAME_MAX} characters).`,
      };
    }

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
      "last_active_at = greatest(coalesce(last_active_at, '-infinity'::timestamptz), now())",
    ];

    const removePicture = s(formData, "removePicture") === "on";
    const pictureFile = formData.get("pictureFile");
    const pictureRaw = s(formData, "pictureUrl");
    let pictureUrl = "";

    if (removePicture) {
      await deleteProfilePhoto(user.id);
      pictureUrl = "";
    } else if (pictureFile instanceof File && pictureFile.size > 0) {
      if (pictureFile.size > PROFILE_PHOTO_MAX_BYTES) {
        return {
          error: `That photo is too big. Choose a file ${PROFILE_PHOTO_MAX_LABEL} or smaller.`,
        };
      }
      const declared = pictureFile.type.toLowerCase();
      if (declared && !PROFILE_PHOTO_TYPES.has(declared)) {
        return { error: "Photo must be a JPEG, PNG, WebP, or GIF." };
      }
      const bytes = Buffer.from(await pictureFile.arrayBuffer());
      const type = detectProfilePhotoType(bytes);
      if (!type) {
        return { error: "Photo must be a JPEG, PNG, WebP, or GIF." };
      }
      // Prefer sniffed type over browser MIME (reject mismatched spoofing).
      if (declared && declared !== type) {
        return { error: "Photo file contents do not match the file type." };
      }
      await upsertProfilePhoto(user.id, type, bytes);
      pictureUrl = profilePhotoPath(user.id);
    } else if (pictureRaw) {
      // Keep an existing uploaded path, or accept a public http(s) URL.
      const kept = safeProfilePictureSrc(pictureRaw);
      if (kept?.startsWith("/api/profile-photo/")) {
        pictureUrl = kept;
      } else {
        const external = normalizeStoredHttpUrl(pictureRaw);
        if (!external) {
          return { error: "Picture URL must be a public http(s) link." };
        }
        await deleteProfilePhoto(user.id);
        pictureUrl = external;
      }
    } else {
      await deleteProfilePhoto(user.id);
      pictureUrl = "";
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Body exceeded|body.*limit|Entity too large|413|payload/i.test(msg)) {
      return {
        error: `That photo is too big. Choose a file ${PROFILE_PHOTO_MAX_LABEL} or smaller.`,
      };
    }
    return { error: "Could not save profile." };
  }
}
