import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../_lib/supabaseAdmin.js", () => ({ supabaseAdmin: {} }));
vi.mock("../../src/lib/lowStockAlerts.js", () => ({ detectLowStock: vi.fn() }));

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { detectLowStock } from "../../src/lib/lowStockAlerts.js";
import { makeReq, makeRes } from "../_lib/testHandler.js";
import handler from "./low-stock-check.js";

const PRODUCTS = [
  { id: "product-1", circle_id: "circle-1", low_stock_alert_active: false },
  { id: "product-2", circle_id: "circle-2", low_stock_alert_active: true },
];

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    product_id: "product-1",
    quantity: 1,
    unit_price: 5,
    unit_spec_value: 2,
    unit_spec_unit: "L",
    is_promotion: false,
    receipts: {
      purchase_date: "2026-09-01",
      store_name_en: "Countdown",
      store_name_zh: null,
    },
    ...overrides,
  };
}

// What fetchPurchaseHistories hands back for one itemRow. The cron passes
// Purchases straight through to detectLowStock, which reads only the
// quantity-shaped fields of them.
function purchase(overrides: Record<string, unknown> = {}) {
  return {
    purchaseDate: "2026-09-01",
    storeNameEn: "Countdown",
    storeNameZh: "Countdown",
    unitPrice: 5,
    quantity: 1,
    specValue: 2,
    specUnit: "L",
    isPromotion: false,
    ...overrides,
  };
}

type Result = { data?: unknown; error: unknown; count?: number | null };

const OK = { error: null };

interface Wiring {
  /** The `products` sweep. */
  products?: Result;
  /** One flat row set for the batched history read, as PostgREST returns it. */
  receiptItems?: Result;
  /** Results for the write-backs to `products`, in the order they happen. */
  productUpdates?: Result[];
  /** The `alerts` insert. */
  alerts?: Result;
}

function installSupabase({
  products = { data: PRODUCTS, error: null },
  receiptItems = { data: [], error: null },
  productUpdates = [OK, OK],
  alerts = OK,
}: Wiring = {}) {
  return installFakeSupabase(supabaseAdmin, {
    tables: {
      // The sweep reads `products` first, then writes the flags back.
      products: [products, ...productUpdates],
      receipt_items: [receiptItems],
      alerts,
    },
  });
}

/**
 * The (payload, ids) pairs written back to `products`, in order — the pairing
 * is what says which flag went to which Product, so it stays order-sensitive.
 */
function writesTo(calls: Array<[string, ...unknown[]]>) {
  const pairs: Array<{ payload: unknown; ids: unknown }> = [];
  calls.forEach(([method, ...args], index) => {
    if (method !== "update") {
      return;
    }
    const next = calls[index + 1];
    pairs.push({ payload: args[0], ids: next?.[0] === "in" ? next[2] : undefined });
  });
  return pairs;
}

/** The product ids each batched history query asked for. */
function historyQueries(calls: Array<[string, ...unknown[]]>) {
  return calls.filter(([method]) => method === "in").map(([, , ids]) => ids);
}

// What Vercel Cron sends as `Authorization: Bearer $CRON_SECRET`.
const CRON_SECRET = "cron-secret-from-env";

/** The one request shape that should get through: a GET carrying the secret. */
function cronReq() {
  return makeReq({ method: "GET", authToken: CRON_SECRET });
}

describe("GET /api/cron/low-stock-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectLowStock).mockReturnValue({ newAlerts: [], recoveries: [] } as never);
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // Issue 19: this route reads and writes with the service-role client, so it
  // sweeps every Circle regardless of RLS. It is the one route in api/ that
  // has no user session to check, so the shared secret is the whole of its
  // access control.
  it.each(["POST", "DELETE", "PUT"])("rejects %s with 405", async (method) => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method, authToken: CRON_SECRET }), res.res);

    expect(res.statusCode).toBe(405);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a GET with no Authorization header with 401", async () => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a GET carrying the wrong secret with 401", async () => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: "not-the-secret" }), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  // Fails closed: an unset CRON_SECRET in production is the exact case this
  // check exists to protect against, so it must not degrade into "skip the
  // check" -- that would leave the route open precisely when it is misconfigured.
  it("refuses every caller when CRON_SECRET is unset, rather than skipping the check", async () => {
    delete process.env.CRON_SECRET;
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: CRON_SECRET }), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("runs the sweep for a GET carrying the right secret", async () => {
    installSupabase();
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(res.statusCode).toBe(200);
  });

  it("sweeps every Circle in one pass, using the service-role client", async () => {
    const db = installSupabase();

    await handler(cronReq(), makeRes().res);

    expect(db.from).toHaveBeenCalledWith("products");
  });

  // Was the N+1 in issue 20: one receipt_items query per Product. The route
  // now goes through fetchPurchaseHistories, so every Product is covered by a
  // single batched query no matter how many there are. Only one result is
  // queued for `receipt_items`, so a second query would throw.
  it("loads every Product's purchase history in one batched query", async () => {
    const db = installSupabase();

    await handler(cronReq(), makeRes().res);

    expect(historyQueries(db.callsFor("receipt_items"))).toEqual([["product-1", "product-2"]]);
  });

  it("hands each Product its own Purchase History, normalized", async () => {
    installSupabase({
      receiptItems: { data: [itemRow({ quantity: 3 })], error: null },
    });

    await handler(cronReq(), makeRes().res);

    expect(detectLowStock).toHaveBeenCalledWith(
      [
        {
          productId: "product-1",
          circleId: "circle-1",
          lowStockAlertActive: false,
          purchases: [purchase({ quantity: 3 })],
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
    installSupabase({
      receiptItems: {
        data: [
          itemRow({ unit_spec_value: null }),
          itemRow({ unit_spec_unit: null }),
          itemRow({ quantity: 9 }),
        ],
        error: null,
      },
    });

    await handler(cronReq(), makeRes().res);

    const checks = vi.mocked(detectLowStock).mock.calls[0][0];
    expect(checks[0].purchases).toEqual([purchase({ quantity: 9 })]);
  });

  it("reports counts, and touches nothing, when there's nothing to do", async () => {
    const db = installSupabase();
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(db.callsFor("alerts")).toEqual([]);
    expect(writesTo(db.callsFor("products"))).toEqual([]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ newAlerts: 0, recoveries: 0 });
  });

  it("records a new Alert against the Product's own Circle, then flags the Product", async () => {
    const db = installSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [{ productId: "product-2" }],
      recoveries: [],
    } as never);
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(db.callsFor("alerts")).toContainEqual([
      "insert",
      [{ circle_id: "circle-2", type: "low_stock", product_id: "product-2" }],
    ]);
    expect(writesTo(db.callsFor("products"))).toEqual([
      { payload: { low_stock_alert_active: true }, ids: ["product-2"] },
    ]);
    expect(res.body).toEqual({ newAlerts: 1, recoveries: 0 });
  });

  // A recovery clears the flag but raises no Alert — the user doesn't need
  // telling that something stopped being a problem.
  it("clears the flag on a recovered Product without inserting an Alert", async () => {
    const db = installSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [],
      recoveries: ["product-2"],
    } as never);
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(db.callsFor("alerts")).toEqual([]);
    expect(writesTo(db.callsFor("products"))).toEqual([
      { payload: { low_stock_alert_active: false }, ids: ["product-2"] },
    ]);
    expect(res.body).toEqual({ newAlerts: 0, recoveries: 1 });
  });

  it("handles alerts and recoveries in the same run", async () => {
    const db = installSupabase();
    vi.mocked(detectLowStock).mockReturnValue({
      newAlerts: [{ productId: "product-1" }],
      recoveries: ["product-2"],
    } as never);
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(writesTo(db.callsFor("products"))).toEqual([
      { payload: { low_stock_alert_active: true }, ids: ["product-1"] },
      { payload: { low_stock_alert_active: false }, ids: ["product-2"] },
    ]);
    expect(res.body).toEqual({ newAlerts: 1, recoveries: 1 });
  });

  describe("failures", () => {
    it("500s when products can't be loaded", async () => {
      const db = installSupabase({ products: { data: null, error: { message: "timeout" } } });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load products" });
      expect(db.callsFor("receipt_items")).toEqual([]);
    });

    it("500s when the batched purchase-history query can't be loaded", async () => {
      const db = installSupabase({
        receiptItems: { data: null, error: { message: "statement timeout" } },
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load purchase history" });
      expect(historyQueries(db.callsFor("receipt_items"))).toEqual([["product-1", "product-2"]]);
      expect(detectLowStock).not.toHaveBeenCalled();
    });

    // The insert and the flag update aren't in one transaction: if flagging
    // fails after the Alert row landed, the Alert stays and the Product is
    // left unflagged, so the next run raises it again.
    it("500s when the Alert can't be recorded, without flagging the Product", async () => {
      const db = installSupabase({ alerts: { error: { message: "fk violation" } } });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [{ productId: "product-1" }],
        recoveries: [],
      } as never);
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to record low-stock alerts" });
      expect(writesTo(db.callsFor("products"))).toEqual([]);
    });

    it("500s when the Product can't be flagged, leaving the Alert already inserted", async () => {
      const db = installSupabase({ productUpdates: [{ error: { message: "deadlock" } }, OK] });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [{ productId: "product-1" }],
        recoveries: ["product-2"],
      } as never);
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to flag products as low stock" });
      expect(db.callsFor("alerts")).toContainEqual([
        "insert",
        [{ circle_id: "circle-1", type: "low_stock", product_id: "product-1" }],
      ]);
    });

    it("500s when a recovered Product can't be reset", async () => {
      installSupabase({ productUpdates: [{ error: { message: "deadlock" } }] });
      vi.mocked(detectLowStock).mockReturnValue({
        newAlerts: [],
        recoveries: ["product-2"],
      } as never);
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to reset recovered products" });
    });
  });
});
