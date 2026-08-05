import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here (Section 15, page 3:
// historical receipts, filterable by store/date/uploader; RLS already
// scopes every query to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchReceipts } from "@/lib/receiptList";

// Mirrors supabase-js's real query builder: every filter method returns the
// same chainable object, which is itself thenable (awaiting it resolves the
// query — no separate .then()/.execute() call needed).
function receiptsChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: unknown) => void) => Promise<unknown>;
  } = {};
  for (const method of ["select", "or", "gte", "lte", "eq", "order"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
}

describe("fetchReceipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads receipts newest-first with no filters applied", async () => {
    const chain = receiptsChain({
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
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const receipts = await fetchReceipts();

    expect(chain.order).toHaveBeenCalledWith("purchase_date", { ascending: false });
    expect(chain.or).not.toHaveBeenCalled();
    expect(chain.gte).not.toHaveBeenCalled();
    expect(chain.lte).not.toHaveBeenCalled();
    expect(chain.eq).not.toHaveBeenCalled();
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
    const chain = receiptsChain({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await fetchReceipts({
      storeQuery: "Countdown",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      uploadedBy: "user-1",
    });

    expect(chain.or).toHaveBeenCalledWith(
      "store_name_en.ilike.%Countdown%,store_name_zh.ilike.%Countdown%"
    );
    expect(chain.gte).toHaveBeenCalledWith("purchase_date", "2026-08-01");
    expect(chain.lte).toHaveBeenCalledWith("purchase_date", "2026-08-31");
    expect(chain.eq).toHaveBeenCalledWith("uploaded_by", "user-1");
  });

  it("throws when the query fails", async () => {
    const chain = receiptsChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(fetchReceipts()).rejects.toThrow("network error");
  });
});
