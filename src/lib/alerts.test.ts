import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here, not the behavior we're
// testing (Section 13/15: the notification list reads the circle's alerts,
// RLS already scopes to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchAlerts } from "@/lib/alerts";

function selectOrderChain(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ order }));
  return { select, order };
}

describe("fetchAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads alerts newest-first, with the bilingual product name joined in", async () => {
    const chain = selectOrderChain({
      data: [
        {
          id: "alert-1",
          type: "price_spike",
          product_id: "product-1",
          new_price: 5.0,
          change_percent: 25,
          created_at: "2026-08-05T00:00:00Z",
          products: { canonical_name_en: "Anchor Blue Milk", canonical_name_zh: "安科蓝带牛奶" },
        },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const alerts = await fetchAlerts();

    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(alerts).toEqual([
      {
        id: "alert-1",
        type: "price_spike",
        productId: "product-1",
        productNameEn: "Anchor Blue Milk",
        productNameZh: "安科蓝带牛奶",
        newPrice: 5.0,
        changePercent: 25,
        createdAt: "2026-08-05T00:00:00Z",
      },
    ]);
  });

  it("throws when the query fails", async () => {
    const chain = selectOrderChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(fetchAlerts()).rejects.toThrow("network error");
  });
});
