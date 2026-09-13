import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// One confirmed ReceiptItem, flattened together with its Receipt's date and
// store — the shared shape every price/consumption feature reads from.
// priceChange.ts's PurchaseRecord and consumptionRate.ts's
// ConsumptionPurchaseRecord are both projections of this; a Purchase is
// structurally assignable to either, so callers pass it straight through.
export interface Purchase {
  purchaseDate: string; // "YYYY-MM-DD"
  storeNameEn: string;
  storeNameZh: string;
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

const PURCHASE_SELECT =
  "product_id, unit_price, quantity, unit_spec_value, unit_spec_unit, is_promotion, receipts!inner(purchase_date, store_name_en, store_name_zh, status)";

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

  const { data, error } = await client
    .from("receipt_items")
    .select(PURCHASE_SELECT)
    .in("product_id", uniqueIds)
    .eq("receipts.status", "confirmed")
    // Ordering is re-applied per product below; asking Postgres for it too
    // means same-date rows keep a stable, database-defined order through the
    // (stable) sort rather than depending on however PostgREST returned them.
    .order("purchase_date", { foreignTable: "receipts", ascending: true });
  if (error) {
    throw error;
  }

  const rows = data ?? [];

  const byProduct = new Map<string, Purchase[]>(uniqueIds.map((id) => [id, []]));
  for (const row of rows) {
    // An unlinked row (no product_id) has no history to belong to; a row with
    // no unit spec can't be normalized to a comparable unit price or a base
    // quantity, so it's meaningless to every consumer downstream.
    if (row.product_id == null || row.unit_spec_value == null || !row.unit_spec_unit) {
      continue;
    }
    byProduct.get(row.product_id)?.push({
      purchaseDate: row.receipts.purchase_date,
      storeNameEn: row.receipts.store_name_en,
      storeNameZh: row.receipts.store_name_zh ?? row.receipts.store_name_en,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      specValue: row.unit_spec_value,
      specUnit: row.unit_spec_unit,
      isPromotion: row.is_promotion,
    });
  }

  return uniqueIds.map((productId) => ({
    productId,
    purchases: (byProduct.get(productId) ?? []).sort((a, b) =>
      a.purchaseDate.localeCompare(b.purchaseDate)
    ),
  }));
}
