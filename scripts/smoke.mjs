/**
 * Success-check smoke test (plan):
 * Owner never sees purchase; other members see taken; last qty claim fails cleanly.
 * Runs against PGlite via the same migration files (no HTTP).
 */
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const db = new PGlite();
const files = (await readdir("migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of files) {
  await db.exec(await readFile(`migrations/${file}`, "utf8"));
}

async function q(text, params = []) {
  return (await db.query(text, params)).rows;
}

async function mkUser(email, name) {
  const hash = await bcrypt.hash("password123", 4);
  const rows = await q(
    `insert into users (email, password_hash, display_name)
     values ($1, $2, $3) returning id`,
    [email, hash, name],
  );
  return rows[0].id;
}

const ownerId = await mkUser("owner@example.com", "Owner");
const buyerId = await mkUser("buyer@example.com", "Buyer");
const thirdId = await mkUser("third@example.com", "Third");

const invite = nanoid(12);
const group = (
  await q(
    `insert into groups (name, owner_id, invite_code) values ($1,$2,$3) returning id`,
    ["Test Group", ownerId, invite],
  )
)[0].id;

for (const [uid, role] of [
  [ownerId, "owner"],
  [buyerId, "member"],
  [thirdId, "member"],
]) {
  await q(
    `insert into group_members (group_id, user_id, role) values ($1,$2,$3)`,
    [group, uid, role],
  );
}

const list = (
  await q(
    `insert into wish_lists (group_id, title, list_type)
     values ($1, $2, 'personal') returning id`,
    [group, "Owner's list"],
  )
)[0].id;
await q(`insert into wish_list_owners (list_id, user_id) values ($1,$2)`, [
  list,
  ownerId,
]);

const item = (
  await q(
    `insert into items (list_id, title, quantity, created_by)
     values ($1, 'Last Mug', 1, $2) returning id`,
    [list, ownerId],
  )
)[0].id;

async function viewAs(userId) {
  const isOwner = (
    await q(
      `select 1 from wish_list_owners where list_id = $1 and user_id = $2`,
      [list, userId],
    )
  ).length;
  const row = (
    await q(
      `select i.quantity,
              coalesce((select sum(p.quantity) from purchases p where p.item_id = i.id),0)::int as purchased_qty
       from items i where i.id = $1`,
      [item],
    )
  )[0];
  const purchased = Number(row.purchased_qty);
  const remaining =
    row.quantity == null ? null : Math.max(0, row.quantity - purchased);
  if (isOwner) {
    return { is_taken: false, purchased_qty: 0, remaining: row.quantity };
  }
  return {
    is_taken: remaining !== null && remaining <= 0,
    purchased_qty: purchased,
    remaining,
  };
}

await db.query("begin");
await q(`select quantity from items where id = $1 for update`, [item]);
await q(
  `insert into purchases (item_id, buyer_user_id, quantity) values ($1,$2,1)`,
  [item, buyerId],
);
await db.query("commit");

const ownerView = await viewAs(ownerId);
const buyerView = await viewAs(buyerId);
const thirdView = await viewAs(thirdId);

let raceError = null;
try {
  await db.query("begin");
  const locked = await q(`select quantity from items where id = $1 for update`, [
    item,
  ]);
  const purchased = (
    await q(
      `select coalesce(sum(quantity),0)::int as total from purchases where item_id = $1`,
      [item],
    )
  )[0].total;
  const remaining = locked[0].quantity - purchased;
  if (remaining < 1) {
    raceError = "Already taken — someone else claimed the last one.";
    await db.query("rollback");
  } else {
    await q(
      `insert into purchases (item_id, buyer_user_id, quantity) values ($1,$2,1)`,
      [item, thirdId],
    );
    await db.query("commit");
  }
} catch (e) {
  await db.query("rollback");
  raceError = String(e);
}

const ok =
  ownerView.is_taken === false &&
  ownerView.purchased_qty === 0 &&
  buyerView.is_taken === true &&
  thirdView.is_taken === true &&
  raceError != null;

console.log(
  JSON.stringify(
    { ownerView, buyerView, thirdView, raceError, ok },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
