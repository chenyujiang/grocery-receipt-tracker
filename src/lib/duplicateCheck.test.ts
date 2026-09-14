import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here (Section 4: new receipts
// are auto-checked for suspected duplicates by matching store + date +
// total amount; RLS already scopes this to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { findDuplicateReceipt } from "@/lib/duplicateCheck";

const CANDIDATE = {
  storeNameEn: "Countdown",
  purchaseDate: "2026-08-04",
  totalAmount: 25.5,
  excludeReceiptId: "receipt-new",
};

describe("findDuplicateReceipt", () => {
  it("finds another receipt matching store, date, and total amount", async () => {
    const db = installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: { id: "receipt-old", uploaded_at: "2026-08-01T10:00:00Z" },
          error: null,
        },
      },
    });

    const match = await findDuplicateReceipt(CANDIDATE);

    expect(db.callsFor("receipts")).toContainEqual(["eq", "store_name_en", "Countdown"]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "purchase_date", "2026-08-04"]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "total_amount", 25.5]);
    expect(db.callsFor("receipts")).toContainEqual(["neq", "id", "receipt-new"]);
    expect(match).toEqual({ id: "receipt-old", uploadedAt: "2026-08-01T10:00:00Z" });
  });

  it("returns null when there's no match", async () => {
    installFakeSupabase(supabase, { tables: { receipts: { data: null, error: null } } });

    const match = await findDuplicateReceipt(CANDIDATE);

    expect(match).toBeNull();
  });

  it("throws when the query fails", async () => {
    installFakeSupabase(supabase, {
      tables: { receipts: { data: null, error: new Error("network error") } },
    });

    await expect(findDuplicateReceipt(CANDIDATE)).rejects.toThrow("network error");
  });
});
