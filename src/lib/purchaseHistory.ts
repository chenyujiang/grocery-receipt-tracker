import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
// Relative + `.js`, not the `@/` alias: this is the one src/lib module that
// `api/` imports at runtime (api/cron/low-stock-check.ts), and the alias is
// a bundler concern the serverless build should not have to resolve.
import type { BilingualName } from "./bilingualName.js";
import { receiptStoreName, STORE_NAMES_EMBED, storeShortName } from "./storeName.js";
import { POSTGREST_PAGE_SIZE } from "./postgrestPaging.js";

// One confirmed ReceiptItem, flattened together with its Receipt's date and
// store — the shared shape every price/consumption feature reads from.
// priceChange.ts's PurchaseRecord and consumptionRate.ts's
// ConsumptionPurchaseRecord are both projections of this; a Purchase is
// structurally assignable to either, so callers pass it straight through.
export interface Purchase {
  purchaseDate: string; // "YYYY-MM-DD"
  // The Receipt it was bought on — how a price-spike check finds the
  // confirmed Receipt's own purchase among the rest.
  receiptId: string;
  // The Store this was bought at. Null only for a receipt confirmed before
  // stores existed and not yet backfilled (issue 29).
  storeId: string | null;
  // The Store's own chain and branch — not the receipt's printed header,
  // which is only how one receipt spelled it. The header stands in only when
  // there's no Store.
  storeNameEn: string;
  storeNameZh: string;
  // The same Store named as briefly as possible, for the trend chart's
  // legend: its branch, else its chain, else (no Store) the header.
  storeShortName: BilingualName;
  unitPrice: number;
  quantity: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

// One product's Purchases, oldest first.
export interface PurchaseHistory {
  productId: string;
  purchases: Purchase[];
}

// `as const` keeps the interpolated string a literal type, which is what
// supabase-js parses to type the rows; a plain template widens to `string`.
const PURCHASE_SELECT =
  `id, product_id, receipt_id, unit_price, quantity, unit_spec_value, unit_spec_unit, is_promotion, receipts!inner(purchase_date, store_id, store_name_en, store_name_zh, status, ${STORE_NAMES_EMBED})` as const;

// 100 UUIDs keep the `in.(...)` filter under ~4KB of URL.
const ID_BATCH_SIZE = 100;

// One id batch's rows, read a page at a time so PostgREST's max-rows can't
// silently truncate them (see postgrestPaging.ts).
async function fetchAllPages(client: SupabaseClient<Database>, productIds: string[]) {
  const rows = [];
  for (let from = 0; ; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await client
      .from("receipt_items")
      .select(PURCHASE_SELECT)
      .in("product_id", productIds)
      .eq("receipts.status", "confirmed")
      // .range() pages are only consistent over a total order of the
      // receipt_items rows themselves — ordering by the embedded receipt's
      // date orders the embed, not these rows — so page by the unique id.
      // The oldest-first contract is applied per product afterwards.
      .order("id", { ascending: true })
      .range(from, from + POSTGREST_PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) {
      return rows;
    }
  }
}

// Sections 10-13: price change, price trend, store comparison, consumption
// rate, price-spike alerts and low-stock alerts all start from the same
// question — "what has this circle actually paid for these products?" — so
// they all start here.
//
// The Supabase client is a parameter rather than an import: which client the
// caller passes *is* the scope decision. The browser's RLS-scoped `supabase`
// sees only the caller's own circle; the cron's service-role `supabaseAdmin`
// sees every circle. Keeping it in the signature also keeps this module free
// of `import.meta.env`, so /api can import it.
//
// Returns one PurchaseHistory per requested product, in the order requested —
// a product with no confirmed purchases comes back with an empty list rather
// than being dropped, so callers can zip the result against their own input.
export async function fetchPurchaseHistories(
  client: SupabaseClient<Database>,
  productIds: string[]
): Promise<PurchaseHistory[]> {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  // Every id is encoded into the request URL; a few hundred UUIDs at once
  // (~37 bytes each) can overrun the gateway's URL length limit. Batches run
  // one after another, so a sweep of every circle stays a gentle read.
  const rows = [];
  for (let start = 0; start < uniqueIds.length; start += ID_BATCH_SIZE) {
    rows.push(...(await fetchAllPages(client, uniqueIds.slice(start, start + ID_BATCH_SIZE))));
  }

  // Oldest first, with same-date rows broken by the row's own unique id: a
  // total order, so the result can't depend on how pages or batches arrived.
  rows.sort(
    (a, b) =>
      a.receipts.purchase_date.localeCompare(b.receipts.purchase_date) || a.id.localeCompare(b.id)
  );

  const byProduct = new Map<string, Purchase[]>(uniqueIds.map((id) => [id, []]));
  for (const row of rows) {
    // An unlinked row (no product_id) has no history to belong to; a row with
    // no unit spec can't be normalized to a comparable unit price or a base
    // quantity, so it's meaningless to every consumer downstream.
    if (row.product_id == null || row.unit_spec_value == null || !row.unit_spec_unit) {
      continue;
    }
    const name = receiptStoreName(row.receipts);
    byProduct.get(row.product_id)?.push({
      purchaseDate: row.receipts.purchase_date,
      receiptId: row.receipt_id,
      storeId: row.receipts.store_id,
      storeNameEn: name.en,
      storeNameZh: name.zh,
      storeShortName: row.receipts.stores ? storeShortName(row.receipts.stores) : name,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      specValue: row.unit_spec_value,
      specUnit: row.unit_spec_unit,
      isPromotion: row.is_promotion,
    });
  }

  return uniqueIds.map((productId) => ({
    productId,
    purchases: byProduct.get(productId) ?? [],
  }));
}
