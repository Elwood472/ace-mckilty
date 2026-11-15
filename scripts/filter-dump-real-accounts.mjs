/**
 * Filter a gift-registry dump to real accounts only (Rick + Charli).
 *
 * Usage:
 *   node scripts/filter-dump-real-accounts.mjs
 *   node scripts/filter-dump-real-accounts.mjs --in … --out …
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DIR =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data";
const DEFAULT_IN = path.join(DEFAULT_DIR, "gift-registry-pglite-dump.json");
const DEFAULT_OUT = path.join(DEFAULT_DIR, "gift-registry-pglite-dump.json");

const KEEP_EMAILS = new Set([
  "bluesbrthr@gmail.com", // Rick Bray
  "cmebray@gmail.com", // Charli Bray
]);

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function filterDump(dump) {
  const usersAll = dump.tables.users?.rows ?? [];
  const keepUsers = usersAll.filter((u) =>
    KEEP_EMAILS.has(String(u.email).toLowerCase()),
  );
  if (keepUsers.length !== KEEP_EMAILS.size) {
    const found = new Set(keepUsers.map((u) => u.email.toLowerCase()));
    const missing = [...KEEP_EMAILS].filter((e) => !found.has(e));
    throw new Error(`Missing real accounts in dump: ${missing.join(", ")}`);
  }
  const keepUserIds = new Set(keepUsers.map((u) => u.id));

  const ownersAll = dump.tables.wish_list_owners?.rows ?? [];
  const keepListIds = new Set(
    ownersAll.filter((r) => keepUserIds.has(r.user_id)).map((r) => r.list_id),
  );

  const lists = (dump.tables.wish_lists?.rows ?? []).filter((r) =>
    keepListIds.has(r.id),
  );
  const owners = ownersAll.filter(
    (r) => keepListIds.has(r.list_id) && keepUserIds.has(r.user_id),
  );

  const items = (dump.tables.items?.rows ?? []).filter((r) =>
    keepListIds.has(r.list_id),
  );
  const keepItemIds = new Set(items.map((r) => r.id));

  const itemViewers = (dump.tables.item_viewers?.rows ?? []).filter(
    (r) => keepItemIds.has(r.item_id) && keepUserIds.has(r.user_id),
  );

  const purchases = (dump.tables.purchases?.rows ?? []).filter(
    (r) => keepItemIds.has(r.item_id) && keepUserIds.has(r.buyer_user_id),
  );

  const listAccess = (dump.tables.list_access?.rows ?? []).filter(
    (r) =>
      keepListIds.has(r.list_id) &&
      keepUserIds.has(r.user_id) &&
      (r.granted_by == null || keepUserIds.has(r.granted_by)),
  );

  const listInvites = (dump.tables.list_invites?.rows ?? []).filter(
    (r) =>
      keepListIds.has(r.list_id) &&
      keepUserIds.has(r.invited_by) &&
      (!r.email || KEEP_EMAILS.has(String(r.email).toLowerCase())),
  );

  const listAccessRequests = (
    dump.tables.list_access_requests?.rows ?? []
  ).filter(
    (r) => keepListIds.has(r.list_id) && keepUserIds.has(r.requester_id),
  );

  const sessions = (dump.tables.sessions?.rows ?? []).filter((r) =>
    keepUserIds.has(r.user_id),
  );

  // Drop ephemeral rate-limit keys and any leftover example-scoped noise
  const authRateLimits = [];

  const budgets = (dump.tables.budgets?.rows ?? []).filter((r) =>
    keepUserIds.has(r.user_id),
  );

  // Legacy circle tables — only keep rows tied to keep users (usually empty)
  const groups = (dump.tables.groups?.rows ?? []).filter((r) =>
    keepUserIds.has(r.owner_id),
  );
  const keepGroupIds = new Set(groups.map((g) => g.id));
  const groupMembers = (dump.tables.group_members?.rows ?? []).filter(
    (r) => keepGroupIds.has(r.group_id) && keepUserIds.has(r.user_id),
  );
  const groupInvites = (dump.tables.group_invites?.rows ?? []).filter(
    (r) => keepGroupIds.has(r.group_id) && keepUserIds.has(r.invited_by),
  );
  const couples = (dump.tables.couples?.rows ?? []).filter(
    (r) =>
      keepGroupIds.has(r.group_id) &&
      keepUserIds.has(r.user_a_id) &&
      keepUserIds.has(r.user_b_id),
  );

  const schemaMigrations = dump.tables.schema_migrations?.rows ?? [];

  function pack(name, rows) {
    const cols = dump.tables[name]?.columns;
    if (!cols) return null;
    return { columns: cols, rows };
  }

  const tables = {};
  const mapping = {
    users: keepUsers,
    sessions,
    groups,
    group_members: groupMembers,
    group_invites: groupInvites,
    wish_lists: lists,
    wish_list_owners: owners,
    items,
    item_viewers: itemViewers,
    purchases,
    budgets,
    couples,
    list_access: listAccess,
    list_invites: listInvites,
    list_access_requests: listAccessRequests,
    schema_migrations: schemaMigrations,
    auth_rate_limits: authRateLimits,
  };

  for (const [name, rows] of Object.entries(mapping)) {
    const packed = pack(name, rows);
    if (packed) tables[name] = packed;
  }

  const counts = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, v.rows.length]),
  );

  return {
    ...dump,
    format: "ace-mckilty-gift-registry-pglite-v1",
    filteredAt: new Date().toISOString(),
    filter: {
      keepEmails: [...KEEP_EMAILS],
      note: "Real accounts only — @example.com test users removed",
    },
    tableOrder: (dump.tableOrder || Object.keys(tables)).filter(
      (t) => tables[t],
    ),
    counts,
    tables,
  };
}

const inPath = path.resolve(argValue("--in") || DEFAULT_IN);
const outPath = path.resolve(argValue("--out") || DEFAULT_OUT);
const dump = JSON.parse(await readFile(inPath, "utf8"));
const filtered = filterDump(dump);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(filtered, null, 2), "utf8");

const emails = filtered.tables.users.rows.map((u) => u.email);
const stray = emails.filter((e) => e.toLowerCase().endsWith("@example.com"));
if (stray.length) {
  console.error("FAIL: example.com users still present", stray);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      in: inPath,
      out: outPath,
      emails,
      counts: filtered.counts,
    },
    null,
    2,
  ),
);
