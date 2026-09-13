import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here. The leaderboard math is
// already covered by priceChangeLeaderboard.test.ts; this only checks the
// assembly/wiring. Purchase history is one batched query regardless of how
// many products are involved, so a multi-product fixture costs no extra mock
// chains -- see the ranking test below.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// fetchCircleMembers' own Supabase behavior is already covered by
// circleMembers.test.ts; this only checks that its result is used to label
// the by-uploader breakdown.
vi.mock("@/lib/circleMembers", () => ({
  fetchCircleMembers: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchCircleMembers } from "@/lib/circleMembers";
import { fetchMonthlyReport } from "@/lib/monthlyReport";

const MONTH = new Date("2026-08-05");

function monthReceiptsChain(result: { data: unknown; error: unknown }) {
  const lte = vi.fn().mockResolvedValue(result);
  const gte = vi.fn(() => ({ lte }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, gte, lte };
}

function prevMonthReceiptsChain(result: { data: unknown; error: unknown }) {
  return monthReceiptsChain(result);
}

function alertsCountChain(result: { count: number | null; error: unknown }) {
  const lt = vi.fn().mockResolvedValue(result);
  const gte = vi.fn(() => ({ lt }));
  const select = vi.fn(() => ({ gte }));
  return { select, gte, lt };
}

function productsChain(result: { data: unknown; error: unknown }) {
  const inFn = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ in: inFn }));
  return { select, in: inFn };
}

// The leaderboard purchase history comes from fetchPurchaseHistories, which
// batches every product into one query:
// select...in("product_id",[...]).eq("receipts.status",...).order(...).
function historyChain(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const eqStatus = vi.fn(() => ({ order }));
  const inProducts = vi.fn(() => ({ eq: eqStatus }));
  const select = vi.fn(() => ({ in: inProducts }));
  return { select, inProducts, eqStatus, order };
}

describe("fetchMonthlyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles total spend, category breakdown, alert count, uploader spend, and the price-change leaderboard", async () => {
    const monthChain = monthReceiptsChain({
      data: [
        {
          total_amount: 12.0,
          uploaded_by: "user-1",
          receipt_items: [
            {
              subtotal: 12.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-1",
              raw_name_en: "Anchor Blue Milk 500g",
              raw_name_zh: "安科蓝带牛奶 500克",
              products: {
                category: "Food - Dairy & Bakery",
                canonical_name_en: "Anchor Blue Milk",
                canonical_name_zh: "安科蓝带牛奶",
              },
            },
          ],
        },
      ],
      error: null,
    });
    const prevChain = prevMonthReceiptsChain({
      data: [{ total_amount: 10.0, uploaded_by: "user-1", receipt_items: [] }],
      error: null,
    });
    const alertsChain = alertsCountChain({ count: 2, error: null });
    const productsRowsChain = productsChain({
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    });
    const historyRowsChain = historyChain({
      data: [
        {
          product_id: "product-1",
          unit_price: 4.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-07-01" },
        },
        {
          product_id: "product-1",
          unit_price: 6.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-01" },
        },
      ],
      error: null,
    });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(monthChain as never)
      .mockReturnValueOnce(prevChain as never)
      .mockReturnValueOnce(alertsChain as never)
      .mockReturnValueOnce(productsRowsChain as never)
      .mockReturnValueOnce(historyRowsChain as never);
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    expect(monthChain.gte).toHaveBeenCalledWith("purchase_date", "2026-08-01");
    expect(monthChain.lte).toHaveBeenCalledWith("purchase_date", "2026-08-31");
    expect(prevChain.gte).toHaveBeenCalledWith("purchase_date", "2026-07-01");
    expect(prevChain.lte).toHaveBeenCalledWith("purchase_date", "2026-07-31");
    expect(alertsChain.gte).toHaveBeenCalledWith("created_at", "2026-08-01");
    expect(alertsChain.lt).toHaveBeenCalledWith("created_at", "2026-09-01");

    expect(report.totalSpend).toBe(12.0);
    expect(report.previousMonthSpend).toBe(10.0);
    expect(report.changePercent).toBe(20);
    expect(report.categoryBreakdown).toEqual([
      {
        category: "Food - Dairy & Bakery",
        total: 12.0,
        products: [
          {
            productId: "product-1",
            nameEn: "Anchor Blue Milk",
            nameZh: "安科蓝带牛奶",
            total: 12.0,
            promoSavings: 0,
          },
        ],
      },
    ]);
    expect(report.alertCount).toBe(2);
    expect(report.receiptCount).toBe(1);
    expect(report.lineItemCount).toBe(1);
    expect(report.spendByUploader).toEqual([{ userId: "user-1", displayName: "eason", total: 12.0 }]);
    // baseline 2026-07-01 ($0.80/100g) -> current 2026-08-01 ($1.20/100g): +50%
    expect(report.priceChangeLeaderboard).toEqual([
      { productId: "product-1", nameEn: "Anchor Blue Milk", nameZh: "安科蓝带牛奶", changePercent: 50 },
    ]);
  });

  it("aggregates multiple items of the same product, and falls back to the raw recognized name when unmatched", async () => {
    const monthChain = monthReceiptsChain({
      data: [
        {
          total_amount: 20.0,
          uploaded_by: "user-1",
          receipt_items: [
            {
              subtotal: 6.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-1",
              raw_name_en: "Anchor Blue Milk 500g",
              raw_name_zh: "安科蓝带牛奶 500克",
              products: {
                category: "Food - Dairy & Bakery",
                canonical_name_en: "Anchor Blue Milk",
                canonical_name_zh: "安科蓝带牛奶",
              },
            },
            {
              subtotal: 6.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-1",
              raw_name_en: "Anchor Blue Milk 500g",
              raw_name_zh: "安科蓝带牛奶 500克",
              products: {
                category: "Food - Dairy & Bakery",
                canonical_name_en: "Anchor Blue Milk",
                canonical_name_zh: "安科蓝带牛奶",
              },
            },
            {
              subtotal: 8.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: null,
              raw_name_en: "Mystery Snack",
              raw_name_zh: null,
              products: null,
            },
          ],
        },
      ],
      error: null,
    });
    const prevChain = prevMonthReceiptsChain({ data: [], error: null });
    const alertsChain = alertsCountChain({ count: 0, error: null });
    const productsRowsChain = productsChain({
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    });
    const historyRowsChain = historyChain({ data: [], error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(monthChain as never)
      .mockReturnValueOnce(prevChain as never)
      .mockReturnValueOnce(alertsChain as never)
      .mockReturnValueOnce(productsRowsChain as never)
      .mockReturnValueOnce(historyRowsChain as never);
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    expect(report.categoryBreakdown).toEqual([
      {
        category: "Food - Dairy & Bakery",
        total: 12.0,
        products: [
          {
            productId: "product-1",
            nameEn: "Anchor Blue Milk",
            nameZh: "安科蓝带牛奶",
            total: 12.0,
            promoSavings: 0,
          },
        ],
      },
      {
        category: "Other / Uncategorized",
        total: 8.0,
        products: [{ productId: null, nameEn: "Mystery Snack", nameZh: "", total: 8.0, promoSavings: 0 }],
      },
    ]);
  });

  it("sums a product's promotional savings (original price vs. what was actually paid) without touching its spend total", async () => {
    const monthChain = monthReceiptsChain({
      data: [
        {
          total_amount: 8.0,
          uploaded_by: "user-1",
          receipt_items: [
            {
              subtotal: 8.0,
              quantity: 2,
              original_price: 5.0,
              is_promotion: true,
              product_id: "product-1",
              raw_name_en: "Anchor Blue Milk 500g",
              raw_name_zh: "安科蓝带牛奶 500克",
              products: {
                category: "Food - Dairy & Bakery",
                canonical_name_en: "Anchor Blue Milk",
                canonical_name_zh: "安科蓝带牛奶",
              },
            },
          ],
        },
      ],
      error: null,
    });
    const prevChain = prevMonthReceiptsChain({ data: [], error: null });
    const alertsChain = alertsCountChain({ count: 0, error: null });
    const productsRowsChain = productsChain({
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    });
    const historyRowsChain = historyChain({ data: [], error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(monthChain as never)
      .mockReturnValueOnce(prevChain as never)
      .mockReturnValueOnce(alertsChain as never)
      .mockReturnValueOnce(productsRowsChain as never)
      .mockReturnValueOnce(historyRowsChain as never);
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    // Paid $8 for 2 units that would've been $5 each ($10) — $2 saved, but
    // total/totalSpend still reflect the $8 actually paid, never $10 or -$2.
    expect(report.totalSpend).toBe(8.0);
    expect(report.categoryBreakdown).toEqual([
      {
        category: "Food - Dairy & Bakery",
        total: 8.0,
        products: [
          {
            productId: "product-1",
            nameEn: "Anchor Blue Milk",
            nameZh: "安科蓝带牛奶",
            total: 8.0,
            promoSavings: 2.0,
          },
        ],
      },
    ]);
  });

  it("throws when the current month's spend query fails", async () => {
    const monthChain = monthReceiptsChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValueOnce(monthChain as never);

    await expect(fetchMonthlyReport(MONTH)).rejects.toThrow("network error");
  });

  // Under the old one-query-per-product loop this test was unaffordable: each
  // extra product needed its own mock chain spliced into the `from` sequence,
  // which is why the multi-product ranking path had never actually run. It is
  // now a single history chain no matter how many products are involved.
  it("ranks the leaderboard across every product that rose this month", async () => {
    const monthChain = monthReceiptsChain({
      data: [
        {
          total_amount: 18.0,
          uploaded_by: "user-1",
          receipt_items: [
            {
              subtotal: 6.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-1",
              raw_name_en: "Milk",
              raw_name_zh: "牛奶",
              products: {
                category: "Food",
                canonical_name_en: "Milk",
                canonical_name_zh: "牛奶",
              },
            },
            {
              subtotal: 6.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-2",
              raw_name_en: "Bread",
              raw_name_zh: "面包",
              products: {
                category: "Food",
                canonical_name_en: "Bread",
                canonical_name_zh: "面包",
              },
            },
            {
              subtotal: 6.0,
              quantity: 1,
              original_price: null,
              is_promotion: false,
              product_id: "product-3",
              raw_name_en: "Eggs",
              raw_name_zh: "鸡蛋",
              products: {
                category: "Food",
                canonical_name_en: "Eggs",
                canonical_name_zh: "鸡蛋",
              },
            },
          ],
        },
      ],
      error: null,
    });
    const prevChain = prevMonthReceiptsChain({ data: [], error: null });
    const alertsChain = alertsCountChain({ count: 0, error: null });
    const productsRowsChain = productsChain({
      data: [
        { id: "product-1", canonical_name_en: "Milk", canonical_name_zh: "牛奶" },
        { id: "product-2", canonical_name_en: "Bread", canonical_name_zh: "面包" },
        { id: "product-3", canonical_name_en: "Eggs", canonical_name_zh: "鸡蛋" },
      ],
      error: null,
    });
    // Deliberately interleaved and out of date order, to pin down that the
    // fetch groups by product and sorts within each group.
    const historyRowsChain = historyChain({
      data: [
        {
          product_id: "product-1",
          unit_price: 6.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-20", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
        {
          product_id: "product-2",
          unit_price: 5.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-02", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
        {
          product_id: "product-3",
          unit_price: 6.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-20", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
        {
          product_id: "product-1",
          unit_price: 4.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-02", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
        {
          product_id: "product-3",
          unit_price: 5.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-02", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
        {
          product_id: "product-2",
          unit_price: 4.0,
          quantity: 1,
          unit_spec_value: 500,
          unit_spec_unit: "g",
          is_promotion: false,
          receipts: { purchase_date: "2026-08-20", store_name_en: "Countdown", store_name_zh: "倒数超市" },
        },
      ],
      error: null,
    });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(monthChain as never)
      .mockReturnValueOnce(prevChain as never)
      .mockReturnValueOnce(alertsChain as never)
      .mockReturnValueOnce(productsRowsChain as never)
      .mockReturnValueOnce(historyRowsChain as never);
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    expect(historyRowsChain.inProducts).toHaveBeenCalledTimes(1);
    expect(historyRowsChain.inProducts).toHaveBeenCalledWith("product_id", [
      "product-1",
      "product-2",
      "product-3",
    ]);
    // product-1 +50%, product-3 +20%, product-2 fell and is excluded.
    expect(report.priceChangeLeaderboard).toEqual([
      { productId: "product-1", nameEn: "Milk", nameZh: "牛奶", changePercent: 50 },
      { productId: "product-3", nameEn: "Eggs", nameZh: "鸡蛋", changePercent: 20 },
    ]);
  });
});
