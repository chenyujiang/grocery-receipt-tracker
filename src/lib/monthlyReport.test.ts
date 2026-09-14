import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here. The leaderboard math is
// already covered by priceChangeLeaderboard.test.ts; this only checks the
// assembly/wiring. Purchase history is one batched query regardless of how
// many products are involved, so a multi-product fixture costs no extra mock
// chains -- see the ranking test below.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

// fetchCircleMembers' own Supabase behavior is already covered by
// circleMembers.test.ts; this only checks that its result is used to label
// the by-uploader breakdown.
vi.mock("@/lib/circleMembers", () => ({
  fetchCircleMembers: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { fetchCircleMembers } from "@/lib/circleMembers";
import { fetchMonthlyReport } from "@/lib/monthlyReport";

const MONTH = new Date("2026-08-05");

/** The methods a table saw, for counting repeated calls. */
function methodsUsed(calls: Array<[string, ...unknown[]]>) {
  return calls.map(([method]) => method);
}

describe("fetchMonthlyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles total spend, category breakdown, alert count, uploader spend, and the price-change leaderboard", async () => {
    const monthResult = {
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
    };
    const prevResult = {
      data: [{ total_amount: 10.0, uploaded_by: "user-1", receipt_items: [] }],
      error: null,
    };
    const alertsResult = { count: 2, error: null };
    const productsResult = {
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    };
    const historyResult = {
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
    };

    const db = installFakeSupabase(supabase, {
      tables: {
        // `receipts` is read twice: this month, then the month before.
        receipts: [monthResult, prevResult],
        alerts: alertsResult,
        products: productsResult,
        receipt_items: historyResult,
      },
    });
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    expect(db.callsFor("receipts")).toContainEqual(["gte", "purchase_date", "2026-08-01"]);
    expect(db.callsFor("receipts")).toContainEqual(["lte", "purchase_date", "2026-08-31"]);
    expect(db.callsFor("receipts")).toContainEqual(["gte", "purchase_date", "2026-07-01"]);
    expect(db.callsFor("receipts")).toContainEqual(["lte", "purchase_date", "2026-07-31"]);
    expect(db.callsFor("alerts")).toContainEqual(["gte", "created_at", "2026-08-01"]);
    expect(db.callsFor("alerts")).toContainEqual(["lt", "created_at", "2026-09-01"]);

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
    const monthResult = {
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
    };
    const prevResult = { data: [], error: null };
    const alertsResult = { count: 0, error: null };
    const productsResult = {
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    };
    const historyResult = { data: [], error: null };

    installFakeSupabase(supabase, {
      tables: {
        // `receipts` is read twice: this month, then the month before.
        receipts: [monthResult, prevResult],
        alerts: alertsResult,
        products: productsResult,
        receipt_items: historyResult,
      },
    });
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
    const monthResult = {
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
    };
    const prevResult = { data: [], error: null };
    const alertsResult = { count: 0, error: null };
    const productsResult = {
      data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" }],
      error: null,
    };
    const historyResult = { data: [], error: null };

    installFakeSupabase(supabase, {
      tables: {
        // `receipts` is read twice: this month, then the month before.
        receipts: [monthResult, prevResult],
        alerts: alertsResult,
        products: productsResult,
        receipt_items: historyResult,
      },
    });
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
    const monthResult = { data: null, error: new Error("network error") };
    installFakeSupabase(supabase, { tables: { receipts: [monthResult] } });

    await expect(fetchMonthlyReport(MONTH)).rejects.toThrow("network error");
  });

  // Under the old one-query-per-product loop this test was unaffordable: each
  // extra product needed its own mock chain spliced into the `from` sequence,
  // which is why the multi-product ranking path had never actually run. It is
  // now a single history chain no matter how many products are involved.
  it("ranks the leaderboard across every product that rose this month", async () => {
    const monthResult = {
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
    };
    const prevResult = { data: [], error: null };
    const alertsResult = { count: 0, error: null };
    const productsResult = {
      data: [
        { id: "product-1", canonical_name_en: "Milk", canonical_name_zh: "牛奶" },
        { id: "product-2", canonical_name_en: "Bread", canonical_name_zh: "面包" },
        { id: "product-3", canonical_name_en: "Eggs", canonical_name_zh: "鸡蛋" },
      ],
      error: null,
    };
    // Deliberately interleaved and out of date order, to pin down that the
    // fetch groups by product and sorts within each group.
    const historyResult = {
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
    };

    const db = installFakeSupabase(supabase, {
      tables: {
        // `receipts` is read twice: this month, then the month before.
        receipts: [monthResult, prevResult],
        alerts: alertsResult,
        products: productsResult,
        receipt_items: historyResult,
      },
    });
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);

    const report = await fetchMonthlyReport(MONTH);

    expect(methodsUsed(db.callsFor("receipt_items")).filter((m) => m === "in")).toHaveLength(1);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "in",
      "product_id",
      ["product-1", "product-2", "product-3"],
    ]);
    // product-1 +50%, product-3 +20%, product-2 fell and is excluded.
    expect(report.priceChangeLeaderboard).toEqual([
      { productId: "product-1", nameEn: "Milk", nameZh: "牛奶", changePercent: 50 },
      { productId: "product-3", nameEn: "Eggs", nameZh: "鸡蛋", changePercent: 20 },
    ]);
  });
});
