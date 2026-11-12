import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { sql } from "./db";
import type { User } from "./types";

export const SESSION_COOKIE = "gr_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const id = nanoid(48);
  await sql(
    `insert into sessions (id, user_id, expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [id, userId],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await sql("delete from sessions where id = $1", [token]);
  }
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<User>(
    `select u.id, u.email, u.display_name, u.created_at::text as created_at
     from sessions s
     join users u on u.id = s.user_id
     where s.id = $1 and s.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
