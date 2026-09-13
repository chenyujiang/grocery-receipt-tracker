import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_lib/supabaseAdmin.js", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("../../src/lib/lowStockAlerts.js", () => ({ detectLowStock: vi.fn() }));

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { detectLowStock } from "../../src/lib/lowStockAlerts.js";
import { makeReq, makeRes } from "../_lib/testHandler.js";
import handler from "./low-stock-check.js";

const PRODUCTS = [
  { id: "product-1", circle_id: "circle-1", low_stock_alert_active: false },
  { id: "product-2", circle_id: "circle-2", low_stock_alert_active: true },
];

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    quantity: 1,
    unit_spec_value: 2,
    unit_spec_unit: "L",
    receipts: { purchase_date: "2026-09-01" },
    ...overrides,
  };
}

type Result = { data?: unknown; error: unknown };

interface Wiring {
  products?: Result;
  /** Keyed by product id; anything unlisted resolves to no rows. */
  receiptItems?: Record<string, Result>;
  receiptItemsError?: unknown;
  insertError?: unknown;
  /** Keyed by the value written to low_stock_alert_active. */
  updateErrors?: { true?: unknown; false?: unknown };
}

function wireSupabase({
  products,
  receiptItems = {},
  receiptItemsError = null,
  insertError = null,
  updateErrors = {},
}: Wiring = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const updates: Array<{ payload: Record<string, unknown>; ids: string[] }> = [];
  const itemQueries: string[] = [];

  const update = vi.fn((payload: Record<string, unknown>) => ({
    in: vi.fn((_column: string, ids: string[]) => {
      updates.push({ payload, ids });
      const key = String(payload.low_stock_alert_active) as "true" | "false";
      return Promise.resolve({ error: updateErrors[key] ?? null });
    }),
  }));

  vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
    if (table === "products") {
      return {
        select: () => Promise.resolve(products ?? { data: PRODUCTS, error: null }),
        update,
      };
    }
    if (table === "receipt_items") {
      return {
        select: () => ({
          eq: (_column: string, productId: string) => {
            itemQueries.push(productId);
            return {
              eq: () => ({
                order: () =>
                  Promise.resolve(
                    receiptItemsError
                      ? { data: null, error: receiptItemsError }
                      : (receiptItems[productId] ?? { data: [], error: null })
                  ),
              }),
            };
          },
        }),
      };
    }
    return { insert };
  }) as never);

  return { insert, update, updates, itemQueries };
}

describe("GET /api/cron/low-stock-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectLowStock).mockReturnValue({ newAlerts: [], recoveries: [] } as never);
  });

  // CHARACTERIZATION, NOT ENDORSEMENT: this route has no method check and no
  // shared-secret check, so anyone who knows the URL can trigger a sweep of
  // every Circle's products.
  // See .scratch/grocery-receipt-tracker/issues/19-authenticate-the-cron-route.md
  it.each(["GET", "POST", "DELETE"])("currently runs for an unauthenticated %s", async (method) => {
    wireSupabase();
    const res = makeRes();

    await handler(makeReq({ method }), res.res);

    expect(res.statusCode).toBe(200);
  });

  it("sweeps every Circle in one pass, using the service-role client", async () => {
    wireSupabase();

    await handler(makeReq({ method: "GET" }), makeRes().res);

    expect(supabaseAdmin.from).toHaveBeenCalledWith("products");
  });

  // CHARACTERIZATION, NOT ENDORSEMENT: one receipt_items query per Product,
  // which is the N+1 that fetchPurchaseHistories exists to prevent.
  // See .scratch/grocery-receipt-tracker/issues/20-cron-bypasses-fetch-purchase-histories.md
  it("currently issues one purchase-history query per Product", async () => {
    const { itemQueries } = wireSupabase();

    await handler(makeReq({ method: "GET" }), makeRes().res);

    expect(itemQueries).toEqual(["product-1", "product-2"]);
  });

  it("hands each Product its own Purchase History, normalized", async () => {
    wireSupabase({
      receiptItems: {
        "product-1": { data: [itemRow({ quantity: 3 })], error: null },
      },
    });

    await handler(makeReq({ method: "GET" }), makeRes().res);

    expect(detectLowStock).toHaveBeenCalledWith(
      [
        {
          productId: "product-1",
          circleId: "circle-1",
          lowStockAlertActive: false,
          purchases: [
            { purchaseDate: "2026-09-01", quantity: 3, specValue: 2, specUnit: "L" },
          ],
        },
        {
          productId: "product-2",
          circleId: "circle-2",
          lowStockAlertActive: true,
          purchases: [],
        },
      ],
      expect.any(Date)
    );
  });

  // Nothing downstream can normalize a row with no unit spec into a
  // comparable Purchase, so it's dropped rather than guessed at.
  it("drops rows with no unit spec instead of failing the run", async () => {
    wireSupabase({
      receiptItems: {
        "product-1": {
          data: [
            itemRow({ unit_spec_value: null }),
            itemRow({ unit_spec_unit: null }),
            itemRow({ quantity: 9 }),
          ],
          error: null,
        },
      },
    });

    await handler(makeReq({ method: "GET" }), makeRes().res);

    const checks = vi.mocked(detectLowStock).mock.calls[0][0];
    expect(checks[0].purchases).toEqual([
      { purchaseDate: "2026-09-01", quantity: 9, specValue: 2, specUnit: "L" },
    ]);
  });

  it("reports counts, and touches nothing, when there's nothing to do", async () => {
    const { insert, update } = wireSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ newAlerts: 0, recoveries: 0 });
  });

  it("records a new Alert against the Product's own Circle, then flags the Product", async () => {
    const { insert, updates } = wireSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [{ productId: "product-2" }],
      recoveries: [],
    } as never);
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(insert).toHaveBeenCalledWith([
      { circle_id: "circle-2", type: "low_stock", product_id: "product-2" },
    ]);
    expect(updates).toEqual([{ payload: { low_stock_alert_active: true }, ids: ["product-2"] }]);
    expect(res.body).toEqual({ newAlerts: 1, recoveries: 0 });
  });

  // A recovery clears the flag but raises no Alert — the user doesn't need
  // telling that something stopped being a problem.
  it("clears the flag on a recovered Product without inserting an Alert", async () => {
    const { insert, updates } = wireSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [],
      recoveries: ["product-2"],
    } as never);
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(insert).not.toHaveBeenCalled();
    expect(updates).toEqual([{ payload: { low_stock_alert_active: false }, ids: ["product-2"] }]);
    expect(res.body).toEqual({ newAlerts: 0, recoveries: 1 });
  });

  it("handles alerts and recoveries in the same run", async () => {
    const { updates } = wireSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [{ productId: "product-1" }],
      recoveries: ["product-2"],
    } as never);
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(updates).toEqual([
      { payload: { low_stock_alert_active: true }, ids: ["product-1"] },
      { payload: { low_stock_alert_active: false }, ids: ["product-2"] },
    ]);
    expect(res.body).toEqual({ newAlerts: 1, recoveries: 1 });
  });

  describe("failures", () => {
    it("500s when products can't be loaded", async () => {
      const { itemQueries } = wireSupabase({ products: { data: null, error: { message: "timeout" } } });
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load products" });
      expect(itemQueries).toEqual([]);
    });

    it("500s on the first Product whose purchase history can't be loaded", async () => {
      const { itemQueries } = wireSupabase({ receiptItemsError: { message: "statement timeout" } });
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load purchase history" });
      expect(itemQueries).toEqual(["product-1"]);
      expect(detectLowStock).not.toHaveBeenCalled();
    });

    // The insert and the flag update aren't in one transaction: if flagging
    // fails after the Alert row landed, the Alert stays and the Product is
    // left unflagged, so the next run raises it again.
    it("500s when the Alert can't be recorded, without flagging the Product", async () => {
      const { updates } = wireSupabase({ insertError: { message: "fk violation" } });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [{ productId: "product-1" }],
        recoveries: [],
      } as never);
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to record low-stock alerts" });
      expect(updates).toEqual([]);
    });

    it("500s when the Product can't be flagged, leaving the Alert already inserted", async () => {
      const { insert } = wireSupabase({ updateErrors: { true: { message: "deadlock" } } });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [{ productId: "product-1" }],
        recoveries: ["product-2"],
      } as never);
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to flag products as low stock" });
      expect(insert).toHaveBeenCalled();
    });

    it("500s when a recovered Product can't be reset", async () => {
      wireSupabase({ updateErrors: { false: { message: "deadlock" } } });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [],
        recoveries: ["product-2"],
      } as never);
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to reset recovered products" });
    });
  });
});
