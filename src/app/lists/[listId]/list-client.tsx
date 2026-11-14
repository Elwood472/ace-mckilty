"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  autofillItemFromUrl,
  createItem,
  deleteItem,
  markPurchased,
  unpurchase,
  type ActionState,
} from "@/app/actions/items";
import { CsrfField } from "@/components/csrf-field";
import { Flash } from "@/components/flash";
import type { ItemView, SortDir, SortKey } from "@/lib/types";

const initial: ActionState = {};

export function ListFilters({
  
  listId,
  sort,
  dir,
  q,
  minPrice,
  maxPrice,
  category,
  source,
  sources,
}: {
  
  listId: string;
  sort: SortKey;
  dir: SortDir;
  q: string;
  minPrice: string;
  maxPrice: string;
  category: string | null;
  source: string;
  sources: string[];
}) {
  return (
    <form
      method="get"
      action={`/lists/${listId}`}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      {category === null ? null : category === "" ? (
        <input type="hidden" name="category" value="__none__" />
      ) : (
        <input type="hidden" name="category" value={category} />
      )}
      <div className="lg:col-span-2">
        <label className="label" htmlFor="q">
          Search
        </label>
        <input id="q" name="q" className="field" defaultValue={q} placeholder="Title, notes…" />
      </div>
      <div>
        <label className="label" htmlFor="minPrice">
          Min $
        </label>
        <input
          id="minPrice"
          name="minPrice"
          type="number"
          step="0.01"
          min="0"
          className="field"
          defaultValue={minPrice}
        />
      </div>
      <div>
        <label className="label" htmlFor="maxPrice">
          Max $
        </label>
        <input
          id="maxPrice"
          name="maxPrice"
          type="number"
          step="0.01"
          min="0"
          className="field"
          defaultValue={maxPrice}
        />
      </div>
      <div>
        <label className="label" htmlFor="source">
          Store / source
        </label>
        <select id="source" name="source" className="field" defaultValue={source}>
          <option value="">Any store</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sort">
          Sort
        </label>
        <select id="sort" name="sort" className="field" defaultValue={sort}>
          <option value="title">Title</option>
          <option value="price">Price</option>
          <option value="category">Category</option>
          <option value="display_date">Show starting</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="dir">
          Direction
        </label>
        <select id="dir" name="dir" className="field" defaultValue={dir}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-6">
        <button type="submit" className="btn ml-auto py-2 text-sm">
          Apply filters
        </button>
      </div>
    </form>
  );
}

function SortHeader({
  label,
  col,
  sort,
  dir,
  
  listId,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: SortDir;
  
  listId: string;
}) {
  const nextDir = sort === col && dir === "asc" ? "desc" : "asc";
  const href = `/lists/${listId}?sort=${col}&dir=${nextDir}`;
  return (
    <Link href={href} style={{ color: "#fff", fontWeight: 700 }}>
      {label}
      {sort === col ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  );
}

export function ItemTable({
  items,
  owner,
  csrf,
  
  listId,
  sort,
  dir,
}: {
  items: ItemView[];
  owner: boolean;
  csrf: string;
  
  listId: string;
  sort: SortKey;
  dir: SortDir;
}) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-muted">
        No items match these filters
        {owner ? (
          <>
            {" — "}
            <Link href={`/lists/${listId}/add`}>add a gift</Link>.
          </>
        ) : (
          "."
        )}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="legacy-table" style={{ minWidth: 720 }}>
        <thead>
          <tr>
            <th>
              <SortHeader label="Item" col="title" sort={sort} dir={dir}  listId={listId} />
            </th>
            <th>
              <SortHeader label="Category" col="category" sort={sort} dir={dir}  listId={listId} />
            </th>
            <th>
              <SortHeader label="Price" col="price" sort={sort} dir={dir}  listId={listId} />
            </th>
            <th>Store</th>
            <th>Qty</th>
            <th>
              <SortHeader label="Show starting" col="display_date" sort={sort} dir={dir}  listId={listId} />
            </th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} owner={owner} csrf={csrf} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({
  item,
  owner,
  csrf,
}: {
  item: ItemView;
  owner: boolean;
  csrf: string;
}) {
  const [purchaseState, purchaseAction, purchasePending] = useActionState(
    markPurchased,
    initial,
  );
  const [unpurchaseState, unpurchaseAction, unpurchasePending] = useActionState(
    unpurchase,
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteItem,
    initial,
  );

  const qtyLabel =
    item.quantity == null
      ? "Unlimited"
      : owner
        ? String(item.quantity)
        : `${item.remaining ?? 0} left / ${item.quantity}`;

  return (
    <tr
      className={[
        "row-hover border-b border-[rgba(20,53,44,0.08)] align-top",
        item.restricted ? "restricted-cue" : "",
        !owner && item.is_taken ? "taken-row" : "",
      ].join(" ")}
    >
      <td className="px-4 py-3">
        <div className="flex gap-3">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-md object-cover"
            />
          ) : null}
          <div>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-pine underline-offset-2 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <p className="font-semibold text-ink">{item.title}</p>
            )}
            {item.notes ? (
              <p className="mt-1 text-muted">{item.notes}</p>
            ) : null}
            {item.restricted ? (
              <p className="mt-1 text-xs font-semibold text-restricted">
                Restricted
                {owner && item.viewer_names
                  ? ` · visible to ${item.viewer_names.join(", ") || "nobody yet"}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{item.category || "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}
      </td>
      <td className="px-4 py-3 text-muted">{item.source || "—"}</td>
      <td className="px-4 py-3">{qtyLabel}</td>
      <td className="px-4 py-3 text-muted">{item.display_date ?? "—"}</td>
      <td className="px-4 py-3">
        {owner ? (
          <form action={deleteAction}>
            <CsrfField token={csrf} />
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              className="text-xs font-semibold text-danger hover:underline"
              disabled={deletePending}
            >
              Remove
            </button>
            <Flash error={deleteState.error} />
          </form>
        ) : item.is_taken && !item.i_bought ? (
          <span className="taken-text">Purchased</span>
        ) : item.i_bought ? (
          <form action={unpurchaseAction} className="space-y-1">
            <CsrfField token={csrf} />
            <input type="hidden" name="itemId" value={item.id} />
            <p className="taken-text">You marked this</p>
            <button
              type="submit"
              className="text-xs font-semibold text-pine underline"
              disabled={unpurchasePending}
            >
              Put it back
            </button>
            <Flash error={unpurchaseState.error} ok={unpurchaseState.ok} />
          </form>
        ) : (
          <form action={purchaseAction} className="space-y-2">
            <CsrfField token={csrf} />
            <input type="hidden" name="itemId" value={item.id} />
            {item.quantity != null && (item.remaining ?? 0) > 1 ? (
              <input
                name="quantity"
                type="number"
                min={1}
                max={item.remaining ?? 1}
                defaultValue={1}
                className="field w-20 py-1"
              />
            ) : (
              <input type="hidden" name="quantity" value="1" />
            )}
            <button
              type="submit"
              className="btn btn-amber py-1.5 text-xs"
              disabled={purchasePending}
            >
              {purchasePending ? "Checking…" : "I bought this"}
            </button>
            <Flash error={purchaseState.error} ok={purchaseState.ok} />
          </form>
        )}
      </td>
    </tr>
  );
}

export function AddItemForm({
  csrf,
  listId,
  members,
}: {
  csrf: string;
  listId: string;
  members: { id: string; display_name: string }[];
}) {
  const [state, action, pending] = useActionState(createItem, initial);
  const [qtyMode, setQtyMode] = useState("1");
  const [restricted, setRestricted] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [autofillMsg, setAutofillMsg] = useState<string | undefined>();
  const [autofillPending, setAutofillPending] = useState(false);

  async function onAutofill() {
    setAutofillPending(true);
    setAutofillMsg(undefined);
    try {
      const result = await autofillItemFromUrl(url);
      if (result.title) setTitle(result.title);
      if (result.price) setPrice(result.price);
      if (result.source) setSource(result.source);
      if (result.imageUrl) setImageUrl(result.imageUrl);
      if (result.notes) setNotes(result.notes);
      setAutofillMsg(
        result.warning ||
          (result.title
            ? "Filled from link — edit anything that looks off."
            : "No fields found — edit manually."),
      );
    } finally {
      setAutofillPending(false);
    }
  }

  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <CsrfField token={csrf} />
      <input type="hidden" name="listId" value={listId} />
      <div className="sm:col-span-2">
        <Flash error={state.error} ok={state.ok} />
        {autofillMsg ? (
          <p style={{ fontSize: 12, color: "#333", marginTop: 0 }}>{autofillMsg}</p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="url">
          Gift URL
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            id="url"
            name="url"
            type="url"
            className="field"
            style={{ flex: "1 1 240px" }}
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={autofillPending || !url.trim()}
            onClick={() => void onAutofill()}
          >
            {autofillPending ? "Fetching…" : "Auto-fill"}
          </button>
        </div>
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#555" }}>
          Paste a product link, then Auto-fill. You can edit every field afterward.
        </span>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          className="field"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="category">
          Category
        </label>
        <input id="category" name="category" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="price">
          Price
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min="0"
          step="0.01"
          className="field"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="qtyMode">
          Quantity
        </label>
        <select
          id="qtyMode"
          name="qtyMode"
          className="field"
          value={qtyMode}
          onChange={(e) => setQtyMode(e.target.value)}
        >
          <option value="1">One</option>
          <option value="n">Multiple</option>
          <option value="unlimited">Unlimited (e.g. gift card)</option>
        </select>
      </div>
      {qtyMode === "n" ? (
        <div>
          <label className="label" htmlFor="quantity">
            How many
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            defaultValue={2}
            className="field"
            required
          />
        </div>
      ) : (
        <div />
      )}
      <div>
        <label className="label" htmlFor="displayDate">
          Show to others starting
        </label>
        <input id="displayDate" name="displayDate" type="date" className="field" />
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#555" }}>
          Leave blank to show immediately. Until this date, only you see the gift.
        </span>
      </div>
      <div>
        <label className="label" htmlFor="source">
          Store / source
        </label>
        <input
          id="source"
          name="source"
          className="field"
          placeholder="Amazon (from URL if blank)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="imageUrl">
          Image URL (shown at 64×64)
        </label>
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          className="field"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          className="field min-h-24"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-muted">
          <input
            type="checkbox"
            name="restricted"
            checked={restricted}
            onChange={(e) => setRestricted(e.target.checked)}
          />
          Restricted visibility (selected people only)
        </label>
        {restricted && (
          <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg border border-[rgba(20,53,44,0.1)] bg-white/60 p-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted">
                No one with access yet — invite someone first.
              </p>
            ) : (
              members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="viewerIds" value={m.id} />
                  {m.display_name}
                </label>
              ))
            )}
          </div>
        )}
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add item"}
        </button>
      </div>
    </form>
  );
}
