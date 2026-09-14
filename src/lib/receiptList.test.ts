import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here (Section 15, page 3:
// historical receipts, filterable by store/date/uploader; RLS already
// scopes every query to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { fetchReceipts } from "@/lib/receiptList";

/** The methods a query used, for asserting that a filter was *not* applied. */
function methodsUsed(calls: Array<[string, ...unknown[]]>) {
  return calls.map(([method]) => method);
}

describe("fetchReceipts", () => {
  // The Bilingual Name rule (CONTEXT.md): a Store whose Translation was never
  // produced reads back as its Source Text. home.ts, receipts.ts, and
  // purchaseHistory.ts all do this; the receipt list was the outlier.
  it("reads an untranslated store name back as its source text", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: [
            {
              id: "receipt-1",
              store_name_en: "New World Victoria Park",
              store_name_zh: null,
              purchase_date: "2026-08-04",
              total_amount: 25.5,
              status: "confirmed",
              uploaded_by: "user-1",
            },
          ],
          error: null,
        },
      },
    });

    const [receipt] = await fetchReceipts();

    expect(receipt.storeNameZh).toBe("New World Victoria Park");
  });

  it("loads receipts newest-first with no filters applied", async () => {
    const db = installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: [
            {
              id: "receipt-1",
              store_name_en: "Countdown",
              store_name_zh: "城内城外",
              purchase_date: "2026-08-04",
              total_amount: 25.5,
              status: "confirmed",
              uploaded_by: "user-1",
            },
          ],
          error: null,
        },
      },
    });

    const receipts = await fetchReceipts();

    // Sort precedence is semantic, so these two stay order-sensitive.
    expect(db.callsFor("receipts").filter(([method]) => method === "order")).toEqual([
      ["order", "purchase_date", { ascending: false }],
      ["order", "uploaded_at", { ascending: false }],
    ]);
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("or");
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("gte");
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("lte");
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("eq");
    expect(receipts).toEqual([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-1",
      },
    ]);
  });

  it("applies store, date-range, and uploader filters when given", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipts: { data: [], error: null } },
    });

    await fetchReceipts({
      storeQuery: "Countdown",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      uploadedBy: "user-1",
    });

    expect(db.callsFor("receipts")).toContainEqual([
      "or",
      "store_name_en.ilike.%Countdown%,store_name_zh.ilike.%Countdown%",
    ]);
    expect(db.callsFor("receipts")).toContainEqual(["gte", "purchase_date", "2026-08-01"]);
    expect(db.callsFor("receipts")).toContainEqual(["lte", "purchase_date", "2026-08-31"]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "uploaded_by", "user-1"]);
  });

  it("throws when the query fails", async () => {
    installFakeSupabase(supabase, {
      tables: { receipts: { data: null, error: new Error("network error") } },
    });

    await expect(fetchReceipts()).rejects.toThrow("network error");
  });
});
