/**
 * Create or promote ADMIN_EMAILS accounts as operators (CLI only).
 *
 * Requires DATABASE_URL, ADMIN_EMAILS, and BOOTSTRAP_PASSWORD (8+).
 * Sets is_operator and inserts admin_operator_grant_lock.
 * Never an HTTP route.
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const password = process.env.BOOTSTRAP_PASSWORD?.trim() ?? "";
const emails = [
  ...new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  ),
];

if (!process.env.DATABASE_URL?.trim()) {
  console.log("provision-admin: no DATABASE_URL — skip");
  process.exit(0);
}
if (password.length < 8) {
  console.error("provision-admin: BOOTSTRAP_PASSWORD must be 8+ characters");
  process.exit(1);
}
if (emails.length === 0) {
  console.log("provision-admin: ADMIN_EMAILS unset — skip");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(`
    alter table users
      add column if not exists is_operator boolean not null default false
  `);
  await client.query(`
    create table if not exists admin_operator_grant_lock (
      id boolean primary key default true check (id),
      locked_at timestamptz not null default now()
    )
  `);

  const hash = await bcrypt.hash(password, 12);
  await client.query("begin");
  for (const email of emails) {
    const existing = await client.query(
      `select id, display_name from users where lower(email) = $1`,
      [email],
    );
    let userId;
    let displayName;
    if (existing.rowCount) {
      userId = existing.rows[0].id;
      displayName = existing.rows[0].display_name;
      await client.query(
        `update users
         set password_hash = $1, is_operator = true
         where id = $2`,
        [hash, userId],
      );
      await client.query(`delete from sessions where user_id = $1`, [userId]);
    } else {
      const local = email.split("@")[0] || "Admin";
      displayName = local.replace(/[._-]+/g, " ").trim() || "Admin";
      const inserted = await client.query(
        `insert into users (email, password_hash, display_name, is_operator)
         values ($1, $2, $3, true)
         returning id`,
        [email, hash, displayName],
      );
      userId = inserted.rows[0].id;
    }

    const personal = await client.query(
      `select l.id from wish_lists l
       join wish_list_owners o on o.list_id = l.id
       where o.user_id = $1 and l.list_type = 'personal'
       limit 1`,
      [userId],
    );
    if (!personal.rowCount) {
      const list = await client.query(
        `insert into wish_lists (group_id, title, list_type)
         values (null, $1, 'personal') returning id`,
        [`${displayName}'s list`],
      );
      await client.query(
        `insert into wish_list_owners (list_id, user_id) values ($1, $2)`,
        [list.rows[0].id, userId],
      );
    }
  }
  await client.query(
    `insert into admin_operator_grant_lock (id, locked_at) values (true, now())
     on conflict (id) do nothing`,
  );
  await client.query("commit");
  console.log(`provision-admin: ready for ${emails.length} operator email(s)`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("provision-admin failed", e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
