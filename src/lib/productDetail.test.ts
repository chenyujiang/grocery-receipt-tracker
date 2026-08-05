import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here. The math (price change,
// trend normalization, store comparison, consumption) is already covered by
// priceChange.test.ts / priceTrend.test.ts / storeComparison.test.ts /
// consumptionRate.test.ts; this only checks the assembly/wiring.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchProductDetail } from "@/lib/productDetail";

function productChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function historyChain(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const eqStatus = vi.fn(() => ({ order }));
  const eqProduct = vi.fn(() => ({ eq: eqStatus }));
  const select = vi.fn(() => ({ eq: eqProduct }));
  return { select, eqProduct, eqStatus, order };
}

const TODAY = new Date("2026-08-05");

describe("fetchProductDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles the product's price change, trend, store comparison, and consumption from its confirmed purchase history", async () => {
    const pChain = productChain({
      data: {
        id: "product-1",
        canonical_name_en: "Anchor Blue Milk",
        canonical_name_zh: "安科蓝带牛奶",
        category: "Food - Dairy & Bakery",
      },
      error: null,
    });
    const hChain = historyChain({
      data: [
        {
          unit_price: 5.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-07-01", store_name_en: "Countdown", store_name_zh: "城内城外" },
        },
        {
          unit_price: 4.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: {
            purchase_date: "2026-07-10",
            store_name_en: "Pak'nSave",
            store_name_zh: "帕克超市",
          },
        },
      ],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "products") return pChain as never;
      if (table === "receipt_items") return hChain as never;
      throw new Error(`unexpected table: ${table}`);
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
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        purchaseDate: "2026-07-10",
        storeNameEn: "Pak'nSave",
        storeNameZh: "帕克超市",
        unitPrice: 4.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
    ]);
  });

  it("throws when the product isn't found", async () => {
    const pChain = productChain({ data: null, error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "products") return pChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(fetchProductDetail("missing", TODAY)).rejects.toThrow("Product not found");
  });

  it("throws when the purchase history query fails", async () => {
    const pChain = productChain({
      data: {
        id: "product-1",
        canonical_name_en: "Anchor Blue Milk",
        canonical_name_zh: "安科蓝带牛奶",
        category: "Food - Dairy & Bakery",
      },
      error: null,
    });
    const hChain = historyChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "products") return pChain as never;
      if (table === "receipt_items") return hChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(fetchProductDetail("product-1", TODAY)).rejects.toThrow("network error");
  });
});
