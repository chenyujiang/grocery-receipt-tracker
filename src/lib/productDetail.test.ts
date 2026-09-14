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

    // baseline 2026-07-01 (100/100g) -> current 2026-07-10 (80/100g): -20%
    expect(detail.priceChange).toEqual({
      changePercent: -20,
      baseline: { basis: "per_100g", value: 1 },
      current: { basis: "per_100g", value: 0.8 },
    });

    expect(detail.priceTrend).toHaveLength(2);
    expect(detail.storeComparison).toHaveLength(2);
    expect(detail.storeComparison[0].storeNameEn).toBe("Pak'nSave"); // cheaper, sorts first

    // Only 2 distinct purchase dates -> below the 3-purchase minimum.
    expect(detail.consumption).toBeNull();

    expect(detail.purchaseHistory).toEqual([
      {
        purchaseDate: "2026-07-01",
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
