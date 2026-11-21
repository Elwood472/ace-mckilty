import { sql } from "@/lib/db";

/**
 * Record that the user did something meaningful (login, gift change, purchase,
 * profile/colors). Admin shows the timestamp only — not which action.
 */
export async function touchLastActive(userId: string): Promise<void> {
  await sql(
    `update users
     set last_active_at = greatest(coalesce(last_active_at, '-infinity'::timestamptz), now())
     where id = $1`,
    [userId],
  );
}
