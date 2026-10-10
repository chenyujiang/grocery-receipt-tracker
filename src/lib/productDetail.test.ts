import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here. The math (price change,
// trend normalization, store comparison, consumption) is already covered by
// priceChange.test.ts / priceTrend.test.ts / storeComparison.test.ts /
// consumptionRate.test.ts; this only checks the assembly/wiring.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { fetchProductDetail } from "@/lib/productDetail";

const TODAY = new Date("2026-08-05");

const PRODUCT = {
  id: "product-1",
  canonical_name_en: "Anchor Blue Milk",
  canonical_name_zh: "安科蓝带牛奶",
  category: "Food - Dairy & Bakery",
};

// The history read goes through fetchPurchaseHistories, which batches on
// product_id and joins the receipt for date and store.
function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    product_id: "product-1",
    unit_price: 5.0,
    quantity: 1,
    unit_spec_value: 500,
    unit_spec_unit: "g",
    is_promotion: false,
    receipts: {
      purchase_date: "2026-07-01",
      store_id: "store-countdown",
      store_name_en: "Countdown",
      store_name_zh: "城内城外",
    },
    ...overrides,
  };
}

describe("fetchProductDetail", () => {
  it("assembles the product's price change, trend, store comparison, and consumption from its confirmed purchase history", async () => {
    installFakeSupabase(supabase, {
      tables: {
        products: { data: PRODUCT, error: null },
        receipt_items: {
          data: [
            historyRow(),
            historyRow({
              unit_price: 4.0,
              receipts: {
                purchase_date: "2026-07-10",
                store_id: "store-paknsave",
                store_name_en: "Pak'nSave",
                store_name_zh: "帕克超市",
              },
            }),
          ],
          error: null,
        },
      },
    });

    const detail = await fetchProductDetail("product-1", TODAY);

    expect(detail.id).toBe("product-1");
    expect(detail.canonicalNameEn).toBe("Anchor Blue Milk");
    expect(detail.canonicalNameZh).toBe("安科蓝带牛奶");
    expect(detail.category).toBe("Food - Dairy & Bakery");

    // The two purchases are at two Stores, and the latest Store has only one,
    // so there is no Same-Store Price Change to headline — the -20% between
    // them is a Store Comparison, not a price change.
    expect(detail.priceChange).toBeNull();

    expect(detail.priceTrend).toHaveLength(2);
    expect(detail.storeComparison).toHaveLength(2);
    expect(detail.storeComparison[0].storeNameEn).toBe("Pak'nSave"); // cheaper, sorts first

    // Only 2 distinct purchase dates -> below the 3-purchase minimum.
    expect(detail.consumption).toBeNull();

    expect(detail.purchaseHistory).toEqual([
      {
        purchaseDate: "2026-07-01",
        storeId: "store-countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        unitPrice: 5.0,
        quantity: 1,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        purchaseDate: "2026-07-10",
        storeId: "store-paknsave",
        storeNameEn: "Pak'nSave",
        storeNameZh: "帕克超市",
        unitPrice: 4.0,
        quantity: 1,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
    ]);
  });

  // Issue 29: the headline is the Same-Store Price Change at the Store of the
  // most recent Purchase, carrying that Store so the page can say where.
  // Across Stores this history would read Riccarton $5.00 -> Hornby $4.40,
  // a -12% "drop" that is really two branches' different prices.
  it("headlines the Same-Store Price Change at the latest purchase's Store, naming it", async () => {
    const at = (storeId: string, en: string, zh: string, purchase_date: string) => ({
      purchase_date,
      store_id: storeId,
      store_name_en: en,
      store_name_zh: zh,
    });
    installFakeSupabase(supabase, {
      tables: {
        products: { data: PRODUCT, error: null },
        receipt_items: {
          data: [
            historyRow({ unit_price: 4.0, receipts: at("store-hornby", "Woolworths Hornby", "沃尔沃斯 霍恩比", "2026-07-01") }),
            historyRow({ unit_price: 5.0, receipts: at("store-riccarton", "Woolworths Riccarton", "沃尔沃斯 里卡顿", "2026-07-05") }),
            historyRow({ unit_price: 4.4, receipts: at("store-hornby", "Woolworths Hornby", "沃尔沃斯 霍恩比", "2026-07-10") }),
          ],
          error: null,
        },
      },
    });

    const detail = await fetchProductDetail("product-1", TODAY);

    // Hornby: 80/100g -> 88/100g, +10%.
    expect(detail.priceChange).toEqual({
      changePercent: 10,
      baseline: { basis: "per_100g", value: 0.8 },
      current: { basis: "per_100g", value: 0.88 },
      storeId: "store-hornby",
      storeNameEn: "Woolworths Hornby",
      storeNameZh: "沃尔沃斯 霍恩比",
    });
  });

  it("throws when the product isn't found", async () => {
    // No `receipt_items` prepared: if the history query ran anyway, the fake
    // would throw rather than quietly return nothing.
    installFakeSupabase(supabase, { tables: { products: { data: null, error: null } } });

    await expect(fetchProductDetail("missing", TODAY)).rejects.toThrow("Product not found");
  });

  it("throws when the purchase history query fails", async () => {
    installFakeSupabase(supabase, {
      tables: {
        products: { data: PRODUCT, error: null },
        receipt_items: { data: null, error: new Error("network error") },
      },
    });

    await expect(fetchProductDetail("product-1", TODAY)).rejects.toThrow("network error");
  });

  // A Product whose Chinese Translation was never produced still has to read
  // back as text, not blank — CONTEXT.md, Bilingual Name.
  it("reads a product with no Chinese translation back as its English source text", async () => {
    installFakeSupabase(supabase, {
      tables: {
        products: { data: { ...PRODUCT, canonical_name_zh: null }, error: null },
        receipt_items: { data: [], error: null },
      },
    });

    const detail = await fetchProductDetail("product-1", TODAY);

    expect(detail.canonicalNameZh).toBe("Anchor Blue Milk");
  });
});
