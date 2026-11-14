"use server";

import { revalidatePath } from "next/cache";
import { sql, withTransaction } from "@/lib/db";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/session";
import {
  getListOwnerIds,
  isListOwner,
  requireListOwner,
  requireListViewer,
} from "@/lib/authz";
import { resolveSource } from "@/lib/source";
import { autofillFromGiftUrl, type AutofillResult } from "@/lib/autofill";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type ActionState = { error?: string; ok?: string };

export async function autofillItemFromUrl(
  url: string,
): Promise<AutofillResult> {
  await requireUser();
  return autofillFromGiftUrl(url);
}

async function revalidateList(listId: string) {
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/dashboard");
}

export async function createItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const listId = s(formData, "listId");
    await requireListOwner(listId, user.id);

    const title = s(formData, "title");
    if (!title) return { error: "Title is required." };

    const notes = s(formData, "notes");
    const url = s(formData, "url");
    const category = s(formData, "category");
    const source = resolveSource(s(formData, "source"), url);
    const imageUrl = s(formData, "imageUrl");
    const displayDate = s(formData, "displayDate") || null;
    const priceRaw = s(formData, "price");
    const qtyMode = s(formData, "qtyMode");
    const qtyRaw = s(formData, "quantity");
    const restricted = s(formData, "restricted") === "on";
    const viewerIds = formData
      .getAll("viewerIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    let quantity: number | null = 1;
    if (qtyMode === "unlimited") quantity = null;
    else if (qtyMode === "n") {
      const n = Number(qtyRaw);
      if (!Number.isInteger(n) || n < 1) {
        return { error: "Quantity must be a positive whole number." };
      }
      quantity = n;
    }

    let price: number | null = null;
    if (priceRaw) {
      price = Number(priceRaw);
      if (Number.isNaN(price) || price < 0) return { error: "Invalid price." };
    }

    const rows = await sql<{ id: string }>(
      `insert into items (
         list_id, title, notes, url, price, category, source, quantity,
         image_url, display_date, restricted, created_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        listId,
        title,
        notes,
        url,
        price,
        category,
        source,
        quantity,
        imageUrl,
        displayDate,
        restricted,
        user.id,
      ],
    );

    if (restricted) {
      for (const vid of viewerIds) {
        await sql(
          `insert into item_viewers (item_id, user_id) values ($1, $2)
           on conflict do nothing`,
          [rows[0].id, vid],
        );
      }
    }

    await revalidateList(listId);
    return { ok: "Item added." };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "UNAUTHORIZED" || e.message === "FORBIDDEN")
    ) {
      return { error: "Not allowed." };
    }
    return { error: "Could not add item." };
  }
}

export async function updateItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const items = await sql<{ list_id: string }>(
      "select list_id from items where id = $1",
      [itemId],
    );
    if (!items.length) return { error: "Item not found." };
    await requireListOwner(items[0].list_id, user.id);

    const title = s(formData, "title");
    if (!title) return { error: "Title is required." };
    const notes = s(formData, "notes");
    const url = s(formData, "url");
    const category = s(formData, "category");
    const source = resolveSource(s(formData, "source"), url);
    const imageUrl = s(formData, "imageUrl");
    const displayDate = s(formData, "displayDate") || null;
    const priceRaw = s(formData, "price");
    const qtyMode = s(formData, "qtyMode");
    const qtyRaw = s(formData, "quantity");
    const restricted = s(formData, "restricted") === "on";
    const viewerIds = formData
      .getAll("viewerIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    let quantity: number | null = 1;
    if (qtyMode === "unlimited") quantity = null;
    else if (qtyMode === "n") {
      const n = Number(qtyRaw);
      if (!Number.isInteger(n) || n < 1) {
        return { error: "Quantity must be a positive whole number." };
      }
      quantity = n;
    }

    let price: number | null = null;
    if (priceRaw) {
      price = Number(priceRaw);
      if (Number.isNaN(price) || price < 0) return { error: "Invalid price." };
    }

    await sql(
      `update items set
         title = $1, notes = $2, url = $3, price = $4, category = $5,
         source = $6, quantity = $7, image_url = $8, display_date = $9,
         restricted = $10, updated_at = now()
       where id = $11`,
      [
        title,
        notes,
        url,
        price,
        category,
        source,
        quantity,
        imageUrl,
        displayDate,
        restricted,
        itemId,
      ],
    );

    await sql("delete from item_viewers where item_id = $1", [itemId]);
    if (restricted) {
      for (const vid of viewerIds) {
        await sql(
          `insert into item_viewers (item_id, user_id) values ($1, $2)
           on conflict do nothing`,
          [itemId, vid],
        );
      }
    }

    await revalidateList(items[0].list_id);
    return { ok: "Item updated." };
  } catch {
    return { error: "Could not update item." };
  }
}

export async function deleteItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const items = await sql<{ list_id: string }>(
      "select list_id from items where id = $1",
      [itemId],
    );
    if (!items.length) return { error: "Item not found." };
    await requireListOwner(items[0].list_id, user.id);
    await sql(
      `update items set deleted = true, deleted_at = now(), updated_at = now()
       where id = $1`,
      [itemId],
    );
    await revalidateList(items[0].list_id);
    revalidatePath("/removed");
    return { ok: "Item removed (can put back from Removed)." };
  } catch {
    return { error: "Could not remove item." };
  }
}

export async function restoreItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const items = await sql<{ list_id: string }>(
      "select list_id from items where id = $1 and deleted = true",
      [itemId],
    );
    if (!items.length) return { error: "Item not found." };
    await requireListOwner(items[0].list_id, user.id);
    await sql(
      `update items set deleted = false, deleted_at = null, updated_at = now()
       where id = $1`,
      [itemId],
    );
    await revalidateList(items[0].list_id);
    revalidatePath("/removed");
    return { ok: "Put back on your list." };
  } catch {
    return { error: "Could not put item back." };
  }
}

export async function purgeRemovedItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const items = await sql<{ list_id: string }>(
      "select list_id from items where id = $1 and deleted = true",
      [itemId],
    );
    if (!items.length) return { error: "Item not found." };
    await requireListOwner(items[0].list_id, user.id);
    await sql(
      `update items set user_purged = true, updated_at = now() where id = $1`,
      [itemId],
    );
    revalidatePath("/removed");
    return { ok: "Purged from removed list." };
  } catch {
    return { error: "Could not purge item." };
  }
}

export async function purgeBoughtItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const purchaseId = s(formData, "purchaseId");
    const rows = await sql(
      `update purchases set buyer_purged = true
       where id = $1 and buyer_user_id = $2
       returning id`,
      [purchaseId, user.id],
    );
    if (!rows.length) return { error: "Not your purchase." };
    revalidatePath("/bought");
    return { ok: "Cleared from gifts you bought." };
  } catch {
    return { error: "Could not purge." };
  }
}

export async function markPurchased(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const qtyRaw = s(formData, "quantity") || "1";
    const claimQty = Number(qtyRaw);
    if (!Number.isInteger(claimQty) || claimQty < 1) {
      return { error: "Invalid quantity." };
    }

    const items = await sql<{
      id: string;
      list_id: string;
      quantity: number | null;
      restricted: boolean;
    }>("select id, list_id, quantity, restricted from items where id = $1", [
      itemId,
    ]);
    if (!items.length) return { error: "Item not found." };
    const item = items[0];

    await requireListViewer(item.list_id, user.id);

    if (await isListOwner(item.list_id, user.id)) {
      return { error: "You cannot mark items on your own list as purchased." };
    }

    if (item.restricted) {
      const allowed = await sql(
        "select 1 from item_viewers where item_id = $1 and user_id = $2",
        [itemId, user.id],
      );
      if (!allowed.length) return { error: "You cannot see this item." };
    }

    const result = await withTransaction(async (query) => {
      const locked = await query<{ quantity: number | null }>(
        "select quantity from items where id = $1 for update",
        [itemId],
      );
      if (!locked.length) return { error: "Item not found." } as const;

      const purchased = await query<{ total: number }>(
        `select coalesce(sum(quantity), 0)::int as total from purchases where item_id = $1`,
        [itemId],
      );
      const taken = Number(purchased[0]?.total ?? 0);
      const max = locked[0].quantity;

      if (max != null) {
        const remaining = max - taken;
        if (remaining < claimQty) {
          return {
            error:
              remaining <= 0
                ? "Already taken — someone else claimed the last one."
                : `Only ${remaining} left.`,
          } as const;
        }
      }

      await query(
        `insert into purchases (item_id, buyer_user_id, quantity)
         values ($1, $2, $3)`,
        [itemId, user.id, claimQty],
      );
      return { ok: "Marked as purchased." } as const;
    });

    await revalidateList(item.list_id);
    return result;
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "UNAUTHORIZED" || e.message === "FORBIDDEN")
    ) {
      return { error: "Not allowed." };
    }
    return { error: "Could not mark purchased." };
  }
}

export async function unpurchase(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();
    const itemId = s(formData, "itemId");
    const items = await sql<{ list_id: string }>(
      "select list_id from items where id = $1",
      [itemId],
    );
    if (!items.length) return { error: "Item not found." };

    const owners = await getListOwnerIds(items[0].list_id);
    if (owners.includes(user.id)) {
      return { error: "Not allowed." };
    }

    await requireListViewer(items[0].list_id, user.id);

    await sql(
      "delete from purchases where item_id = $1 and buyer_user_id = $2",
      [itemId, user.id],
    );
    await revalidateList(items[0].list_id);
    return { ok: "Purchase cleared." };
  } catch {
    return { error: "Could not clear purchase." };
  }
}
