import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here (Section 4: new receipts
// are auto-checked for suspected duplicates by matching store + date +
// total amount; RLS already scopes this to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { findDuplicateReceipt } from "@/lib/duplicateCheck";

function duplicateChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const neq = vi.fn(() => ({ order }));
  const eqTotal = vi.fn(() => ({ neq }));
  const eqDate = vi.fn(() => ({ eq: eqTotal }));
  const eqStore = vi.fn(() => ({ eq: eqDate }));
  const select = vi.fn(() => ({ eq: eqStore }));
  return { select, eqStore, eqDate, eqTotal, neq, order, limit, maybeSingle };
}

describe("findDuplicateReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds another receipt matching store, date, and total amount", async () => {
    const chain = duplicateChain({
      data: { id: "receipt-old", uploaded_at: "2026-08-01T10:00:00Z" },
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const match = await findDuplicateReceipt({
      storeNameEn: "Countdown",
      purchaseDate: "2026-08-04",
      totalAmount: 25.5,
      excludeReceiptId: "receipt-new",
    });

    expect(chain.eqStore).toHaveBeenCalledWith("store_name_en", "Countdown");
    expect(chain.eqDate).toHaveBeenCalledWith("purchase_date", "2026-08-04");
    expect(chain.eqTotal).toHaveBeenCalledWith("total_amount", 25.5);
    expect(chain.neq).toHaveBeenCalledWith("id", "receipt-new");
    expect(match).toEqual({ id: "receipt-old", uploadedAt: "2026-08-01T10:00:00Z" });
  });

  it("returns null when there's no match", async () => {
    const chain = duplicateChain({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const match = await findDuplicateReceipt({
      storeNameEn: "Countdown",
      purchaseDate: "2026-08-04",
      totalAmount: 25.5,
      excludeReceiptId: "receipt-new",
    });

    expect(match).toBeNull();
  });

  it("throws when the query fails", async () => {
    const chain = duplicateChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(
      findDuplicateReceipt({
        storeNameEn: "Countdown",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        excludeReceiptId: "receipt-new",
      })
    ).rejects.toThrow("network error");
  });
});
