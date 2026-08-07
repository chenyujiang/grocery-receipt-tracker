import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here (Section 15, page 1:
// Home/Dashboard reads this month's confirmed receipts, all alerts, and the
// most recent receipts; RLS already scopes every query to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchHomeSummary } from "@/lib/home";

const TODAY = new Date("2026-08-05");

function monthReceiptsChain(result: { data: unknown; error: unknown }) {
  const lte = vi.fn().mockResolvedValue(result);
  const gte = vi.fn(() => ({ lte }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, gte, lte };
}

function alertsCountChain(result: { count: number | null; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  return { select };
}

function recentReceiptsChain(result: { data: unknown; error: unknown }) {
  const limit = vi.fn().mockResolvedValue(result);
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order }));
  return { select, order, limit };
}

describe("fetchHomeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("totals this month's confirmed spend, breaks it down by category, counts alerts, and lists recent receipts", async () => {
    const monthChain = monthReceiptsChain({
      data: [
        {
          total_amount: 25.5,
          receipt_items: [
            { subtotal: 15.5, products: { category: "Food - Fruits" } },
            { subtotal: 10.0, products: { category: "Food - Fruits" } },
          ],
        },
        {
          total_amount: 8.0,
          receipt_items: [{ subtotal: 8.0, products: { category: "Household - Cleaning" } }],
        },
      ],
      error: null,
    });
    const alertsChain = alertsCountChain({ count: 3, error: null });
    const recentChain = recentReceiptsChain({
      data: [
        {
          id: "receipt-1",
          store_name_en: "Countdown",
          store_name_zh: "城内城外",
          purchase_date: "2026-08-04",
          total_amount: 25.5,
          status: "confirmed",
        },
      ],
      error: null,
    });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(monthChain as never)
      .mockReturnValueOnce(alertsChain as never)
      .mockReturnValueOnce(recentChain as never);

    const summary = await fetchHomeSummary(TODAY);

    expect(monthChain.eq).toHaveBeenCalledWith("status", "confirmed");
    expect(monthChain.gte).toHaveBeenCalledWith("purchase_date", "2026-08-01");
    expect(monthChain.lte).toHaveBeenCalledWith("purchase_date", "2026-08-31");

    expect(summary.monthTotal).toBe(33.5);
    expect(summary.categoryBreakdown).toEqual([
      { category: "Food - Fruits", total: 25.5 },
      { category: "Household - Cleaning", total: 8.0 },
    ]);
    expect(summary.pendingAlertsCount).toBe(3);
    expect(summary.recentReceipts).toEqual([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
      },
    ]);
  });

  it("throws when the month-spend query fails", async () => {
    const monthChain = monthReceiptsChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValueOnce(monthChain as never);

    await expect(fetchHomeSummary(TODAY)).rejects.toThrow("network error");
  });
});
