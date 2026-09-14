import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here (Section 15, page 1:
// Home/Dashboard reads this month's confirmed receipts, all alerts, and the
// most recent receipts; RLS already scopes every query to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { fetchHomeSummary } from "@/lib/home";

const TODAY = new Date("2026-08-05");

const NO_ALERTS = { count: 0, error: null };
const NO_RECEIPTS = { data: [], error: null };

describe("fetchHomeSummary", () => {
  it("totals this month's confirmed spend, breaks it down by category, counts alerts, and lists recent receipts", async () => {
    // `receipts` is read twice — month spend first, then recent — so the
    // queue for that table is what tells the two apart.
    const db = installFakeSupabase(supabase, {
      tables: {
        receipts: [
          {
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
          },
          {
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
          },
        ],
        alerts: { count: 3, error: null },
      },
    });

    const summary = await fetchHomeSummary(TODAY);

    expect(db.callsFor("receipts")).toContainEqual(["eq", "status", "confirmed"]);
    expect(db.callsFor("receipts")).toContainEqual(["gte", "purchase_date", "2026-08-01"]);
    expect(db.callsFor("receipts")).toContainEqual(["lte", "purchase_date", "2026-08-31"]);

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
    installFakeSupabase(supabase, {
      tables: { receipts: [{ data: null, error: new Error("network error") }] },
    });

    await expect(fetchHomeSummary(TODAY)).rejects.toThrow("network error");
  });

  // CONTEXT.md, Bilingual Name.
  it("reads a recent receipt's store with no Chinese translation back as its English source text", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: [
          NO_RECEIPTS,
          {
            data: [
              {
                id: "receipt-1",
                store_name_en: "Four Square",
                store_name_zh: null,
                purchase_date: "2026-08-04",
                total_amount: 25.5,
                status: "confirmed",
              },
            ],
            error: null,
          },
        ],
        alerts: NO_ALERTS,
      },
    });

    const summary = await fetchHomeSummary(TODAY);

    expect(summary.recentReceipts[0].storeNameZh).toBe("Four Square");
  });
});
