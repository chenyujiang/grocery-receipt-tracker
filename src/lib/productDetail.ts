import { supabase } from "@/lib/supabaseClient";
import { priceChangeAtStore, type PriceChange } from "@/lib/priceChange";
import { buildPriceTrend, type PriceTrendPoint } from "@/lib/priceTrend";
import { compareStores, type StoreComparisonEntry } from "@/lib/storeComparison";
import { calculateConsumption, type ConsumptionEstimate } from "@/lib/consumptionRate";
import { fetchPurchaseHistories, type Purchase } from "@/lib/purchaseHistory";
import { bilingualName } from "@/lib/bilingualName";
import { UnexplainedError } from "@/lib/errorMessage";

// The detail page's history table renders a Purchase directly.
export type PurchaseHistoryEntry = Purchase;

// The headline figure: the Same-Store Price Change at the Store of the most
// recent Purchase, with that Store, so the page can say where (issue 29).
export interface HeadlinePriceChange extends PriceChange {
  storeId: string;
  storeNameEn: string;
  storeNameZh: string;
}

export interface ProductDetail {
  id: string;
  canonicalNameEn: string;
  canonicalNameZh: string;
  category: string;
  priceChange: HeadlinePriceChange | null;
  priceTrend: PriceTrendPoint[];
  storeComparison: StoreComparisonEntry[];
  consumption: ConsumptionEstimate | null;
  purchaseHistory: PurchaseHistoryEntry[];
}

// Null when the latest Purchase has no Store, or its Store has too few
// normal-price Purchases to compare — never a comparison across Stores.
function headlinePriceChange(purchases: Purchase[]): HeadlinePriceChange | null {
  const latest = purchases[purchases.length - 1];
  if (!latest || latest.storeId === null) {
    return null;
  }
  const atStore = priceChangeAtStore(purchases, latest.storeId);
  if (!atStore) {
    return null;
  }
  return {
    ...atStore.change,
    storeId: latest.storeId,
    storeNameEn: latest.storeNameEn,
    storeNameZh: latest.storeNameZh,
  };
}

// Section 15, page 4: product detail — price trend (S10), multi-store
// comparison (S11), consumption rate / estimated days remaining (S12), and
// purchase history. All four derive from the same confirmed purchase
// history, fetched once and fed into the already-tested pure functions.
export async function fetchProductDetail(
  productId: string,
  today: Date = new Date()
): Promise<ProductDetail> {
  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id, canonical_name_en, canonical_name_zh, category")
    .eq("id", productId)
    .single();
  if (productError || !productRow) {
    throw productError ?? new UnexplainedError("Product not found");
  }

  const [history] = await fetchPurchaseHistories(supabase, [productId]);
  const purchaseHistory = history.purchases;

  const priceChange = headlinePriceChange(purchaseHistory);

  const priceTrend = buildPriceTrend(purchaseHistory);

  const storeComparison = compareStores(purchaseHistory);

  const consumption = calculateConsumption(purchaseHistory, today);

  const canonicalName = bilingualName(
    productRow.canonical_name_en,
    productRow.canonical_name_zh
  );

  return {
    id: productRow.id,
    canonicalNameEn: canonicalName.en,
    canonicalNameZh: canonicalName.zh,
    category: productRow.category,
    priceChange,
    priceTrend,
    storeComparison,
    consumption,
    purchaseHistory,
  };
}
