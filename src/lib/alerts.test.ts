import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here, not the behavior we're
// testing (Section 13/15: the notification list reads the circle's alerts,
// RLS already scopes to the caller's circle).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { fetchAlerts } from "@/lib/alerts";

describe("fetchAlerts", () => {
  it("loads alerts newest-first, with the bilingual product name joined in", async () => {
    const db = installFakeSupabase(supabase, {
      tables: {
        alerts: {
          data: [
            {
              id: "alert-1",
              type: "price_spike",
              product_id: "product-1",
              new_price: 5.0,
              change_percent: 25,
              created_at: "2026-08-05T00:00:00Z",
              products: {
                canonical_name_en: "Anchor Blue Milk",
                canonical_name_zh: "安科蓝带牛奶",
              },
            },
          ],
          error: null,
        },
      },
    });

    const alerts = await fetchAlerts();

    expect(db.callsFor("alerts")).toContainEqual(["order", "created_at", { ascending: false }]);
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
    installFakeSupabase(supabase, {
      tables: { alerts: { data: null, error: new Error("network error") } },
    });

    await expect(fetchAlerts()).rejects.toThrow("network error");
  });
});
