import { sql } from "./db";
import {
  getListOwnerIds,
  hidesPurchaseSpoilers,
} from "./authz";
import type { ItemView, SortDir, SortKey } from "./types";

type RawItem = {
  id: string;
  list_id: string;
  title: string;
  notes: string;
  url: string;
  price: string | null;
  category: string;
  source: string;
  quantity: number | null;
  image_url: string;
  display_date: string | null;
  restricted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  purchased_qty: number;
};

export type ItemFilters = {
  minPrice?: number | null;
  maxPrice?: number | null;
  category?: string | null;
  source?: string | null;
  sort?: SortKey;
  dir?: SortDir;
  q?: string | null;
};

function sortClause(sort: SortKey = "category", dir: SortDir = "asc"): string {
  const allowed: Record<SortKey, string> = {
    title: "i.title",
    price: "i.price",
    category: "i.category",
    display_date: "i.display_date",
  };
  const col = allowed[sort] ?? "i.category";
  const d = dir === "desc" ? "desc" : "asc";
  // Default (and category sorts): category, then alphabetical by title.
  // Other primary columns still break ties by title A→Z.
  if (sort === "category" || !allowed[sort]) {
    return `lower(i.category) ${d}, lower(i.title) asc`;
  }
  if (sort === "title") {
    return `lower(i.title) ${d}`;
  }
  // Postgres requires: column ASC|DESC NULLS LAST (not "nulls last" before ASC).
  if (sort === "price" || sort === "display_date") {
    return `${col} ${d} nulls last, lower(i.title) asc`;
  }
  return `${col} ${d}, lower(i.title) asc`;
}

export async function listVisibleItems(
  listId: string,
  viewerId: string,
  filters: ItemFilters = {},
): Promise<ItemView[]> {
  // Owners and editors manage gifts without purchase spoilers.
  const spoilerBlind = await hidesPurchaseSpoilers(listId, viewerId);
  const ownerIds = await getListOwnerIds(listId);

  const params: unknown[] = [listId, viewerId];
  const where: string[] = ["i.list_id = $1", "i.deleted = false"];

  // Restricted: owners/editors always see; shoppers only if listed as viewer
  where.push(
    `(i.restricted = false or exists (
      select 1 from wish_list_owners o where o.list_id = i.list_id and o.user_id = $2
    ) or exists (
      select 1 from list_access a
      where a.list_id = i.list_id and a.user_id = $2 and a.role = 'editor'
    ) or exists (
      select 1 from item_viewers v where v.item_id = i.id and v.user_id = $2
    ))`,
  );

  // Show-to-others starting date: shoppers only see items that are due
  if (!spoilerBlind) {
    where.push(`(i.display_date is null or i.display_date <= current_date)`);
  }

  if (filters.category != null) {
    params.push(filters.category);
    where.push(`i.category = $${params.length}`);
  }
  if (filters.minPrice != null && !Number.isNaN(filters.minPrice)) {
    params.push(filters.minPrice);
    where.push(`i.price >= $${params.length}`);
  }
  if (filters.maxPrice != null && !Number.isNaN(filters.maxPrice)) {
    params.push(filters.maxPrice);
    where.push(`i.price <= $${params.length}`);
  }
  if (filters.source) {
    params.push(filters.source);
    where.push(`i.source = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(
      `(i.title ilike $${params.length} or i.notes ilike $${params.length} or i.category ilike $${params.length} or i.source ilike $${params.length})`,
    );
  }

  const order = sortClause(filters.sort, filters.dir);

  const rows = await sql<RawItem>(
    `select i.id, i.list_id, i.title, i.notes, i.url, i.price::text as price,
            i.category, i.source, i.quantity, i.image_url,
            i.display_date::text as display_date, i.restricted, i.created_by,
            i.created_at::text as created_at, i.updated_at::text as updated_at,
            coalesce((select sum(p.quantity) from purchases p where p.item_id = i.id), 0)::int as purchased_qty
     from items i
     where ${where.join(" and ")}
     order by ${order}, i.created_at asc`,
    params,
  );

  const views: ItemView[] = [];
  for (const row of rows) {
    const purchased = Number(row.purchased_qty) || 0;
    const remaining =
      row.quantity == null ? null : Math.max(0, row.quantity - purchased);
    const isTaken =
      row.quantity == null ? purchased > 0 : remaining !== null && remaining <= 0;

    let iBought = false;
    if (!spoilerBlind) {
      const mine = await sql<{ qty: number }>(
        `select coalesce(sum(quantity), 0)::int as qty from purchases
         where item_id = $1 and buyer_user_id = $2`,
        [row.id, viewerId],
      );
      iBought = (mine[0]?.qty ?? 0) > 0;
    }

    const view: ItemView = {
      ...row,
      purchased_qty: spoilerBlind ? 0 : purchased,
      remaining: spoilerBlind ? row.quantity : remaining,
      is_taken: spoilerBlind ? false : isTaken,
      i_bought: spoilerBlind ? false : iBought,
    };

    // Owners/editors see who can view restricted items (not buyers)
    if (spoilerBlind && row.restricted) {
      const viewers = await sql<{ display_name: string }>(
        `select u.display_name from item_viewers v
         join users u on u.id = v.user_id
         where v.item_id = $1
         order by u.display_name`,
        [row.id],
      );
      view.viewer_names = viewers.map((v) => v.display_name);
    }

    // Never expose buyer identity to owners/editors via this payload
    void ownerIds;
    views.push(view);
  }

  return views;
}

export async function categoryToc(
  listId: string,
  viewerId: string,
): Promise<{ category: string; count: number }[]> {
  const items = await listVisibleItems(listId, viewerId);
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.category.trim() || "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Store names for the filter dropdown — same visibility rules as the list. */
export async function listVisibleSources(
  listId: string,
  viewerId: string,
): Promise<string[]> {
  const items = await listVisibleItems(listId, viewerId);
  const sources = new Set<string>();
  for (const item of items) {
    const s = item.source?.trim();
    if (s) sources.add(s);
  }
  return [...sources].sort((a, b) => a.localeCompare(b));
}
