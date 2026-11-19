import { canViewList } from "@/lib/authz";
import { sql } from "@/lib/db";
import { getPersonalListId } from "@/lib/lists";
import { safeProfilePictureSrc } from "@/lib/url-safety";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Detect image type from magic bytes — never trust the browser MIME alone. */
export function detectProfilePhotoType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // RIFF....WEBP
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function isUserId(value: string): boolean {
  return UUID_RE.test(value);
}

export { safeProfilePictureSrc };

export function profilePhotoPath(userId: string): string {
  return `/api/profile-photo/${userId}?v=${Date.now()}`;
}

export async function canViewProfilePhoto(
  viewerId: string,
  ownerUserId: string,
): Promise<boolean> {
  if (viewerId === ownerUserId) return true;
  const listId = await getPersonalListId(ownerUserId);
  if (!listId) return false;
  return canViewList(listId, viewerId);
}

export async function upsertProfilePhoto(
  userId: string,
  contentType: string,
  bytes: Buffer,
): Promise<void> {
  await sql(
    `insert into user_profile_photos (user_id, content_type, bytes, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update
       set content_type = excluded.content_type,
           bytes = excluded.bytes,
           updated_at = now()`,
    [userId, contentType, bytes],
  );
}

export async function deleteProfilePhoto(userId: string): Promise<void> {
  await sql(`delete from user_profile_photos where user_id = $1`, [userId]);
}

export async function getProfilePhoto(
  userId: string,
): Promise<{ content_type: string; bytes: Buffer } | null> {
  const rows = await sql<{ content_type: string; bytes: Buffer | Uint8Array }>(
    `select content_type, bytes from user_profile_photos where user_id = $1`,
    [userId],
  );
  if (!rows.length) return null;
  const bytes = Buffer.isBuffer(rows[0].bytes)
    ? rows[0].bytes
    : Buffer.from(rows[0].bytes);
  return { content_type: rows[0].content_type, bytes };
}
