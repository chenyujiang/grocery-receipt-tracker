import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { fetchPurchaseHistories } from "@/lib/purchaseHistory";

// This module takes its Supabase client as a parameter (the browser's
// RLS-scoped one, or the cron's service-role one), so there's nothing to
// vi.mock — the fake client is passed straight in.
function fakeClient(result: { data: unknown; error: unknown }) {
  return createFakeSupabase({ tables: { receipt_items: result } });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    product_id: "p1",
    unit_price: 5,
    quantity: 1,
    unit_spec_value: 500,
    unit_spec_unit: "g",
    is_promotion: false,
    receipts: {
      purchase_date: "2026-08-01",
      store_id: "store-countdown-newmarket",
      store_name_en: "Countdown",
      store_name_zh: "倒数超市",
    },
    ...overrides,
  };
}

describe("fetchPurchaseHistories", () => {
  it("fetches every product in a single query, not one per product", async () => {
    const mock = fakeClient({ data: [row({ product_id: "p1" }), row({ product_id: "p2" })], error: null });

    await fetchPurchaseHistories(mock.client, ["p1", "p2", "p3"]);

    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("receipt_items");
    expect(mock.callsFor("receipt_items")).toContainEqual([
      "in",
      "product_id",
      ["p1", "p2", "p3"],
    ]);
    expect(mock.callsFor("receipt_items")).toContainEqual([
      "eq",
      "receipts.status",
      "confirmed",
    ]);
  });

  it("returns one history per requested product, in the order requested", async () => {
    const mock = fakeClient({ data: [row({ product_id: "p2" }), row({ product_id: "p1" })], error: null });

    const histories = await fetchPurchaseHistories(mock.client, ["p1", "p2"]);

    expect(histories.map((history) => history.productId)).toEqual(["p1", "p2"]);
  });

  it("gives a product with no confirmed purchases an empty history rather than dropping it", async () => {
    const mock = fakeClient({ data: [row({ product_id: "p1" })], error: null });

    const histories = await fetchPurchaseHistories(mock.client, ["p1", "p2"]);

    expect(histories).toHaveLength(2);
    expect(histories[1]).toEqual({ productId: "p2", purchases: [] });
  });

  it("groups rows by product, keeping each product's purchases separate", async () => {
    const mock = fakeClient({
      data: [
        row({ product_id: "p1", unit_price: 5 }),
        row({ product_id: "p2", unit_price: 9 }),
        row({ product_id: "p1", unit_price: 6 }),
      ],
      error: null,
    });

    const histories = await fetchPurchaseHistories(mock.client, ["p1", "p2"]);

    expect(histories[0].purchases.map((purchase) => purchase.unitPrice)).toEqual([5, 6]);
    expect(histories[1].purchases.map((purchase) => purchase.unitPrice)).toEqual([9]);
  });

  it("orders each product's purchases oldest-first regardless of the order the rows arrive in", async () => {
    const mock = fakeClient({
      data: [
        row({ product_id: "p1", receipts: { purchase_date: "2026-08-20", store_name_en: "A", store_name_zh: "A" } }),
        row({ product_id: "p1", receipts: { purchase_date: "2026-08-02", store_name_en: "B", store_name_zh: "B" } }),
        row({ product_id: "p1", receipts: { purchase_date: "2026-08-11", store_name_en: "C", store_name_zh: "C" } }),
      ],
      error: null,
    });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases.map((purchase) => purchase.purchaseDate)).toEqual([
      "2026-08-02",
      "2026-08-11",
      "2026-08-20",
    ]);
  });

  it("maps a row into a Purchase, flattening the embedded receipt", async () => {
    const mock = fakeClient({ data: [row({ is_promotion: true, quantity: 2 })], error: null });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases[0]).toEqual({
      purchaseDate: "2026-08-01",
      storeId: "store-countdown-newmarket",
      storeNameEn: "Countdown",
      storeNameZh: "倒数超市",
      unitPrice: 5,
      quantity: 2,
      specValue: 500,
      specUnit: "g",
      isPromotion: true,
    });
  });

  // Issue 29: the header is only how one receipt happened to print the Store,
  // so every feature that names a Store — comparison, trend legend,
  // leaderboard — reads the Store's own chain and branch instead.
  it("names a purchase after its Store's own chain and branch, not the receipt's printed header", async () => {
    const mock = fakeClient({
      data: [
        row({
          receipts: {
            purchase_date: "2026-08-01",
            store_id: "store-albany",
            store_name_en: "Pak n Save Albany",
            store_name_zh: "帕克超市 阿尔巴尼",
            stores: {
              chain_name_en: "PAK'nSAVE",
              chain_name_zh: "派克储蓄",
              branch_name_en: "Albany",
              branch_name_zh: "奥尔巴尼",
            },
          },
        }),
      ],
      error: null,
    });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases[0]).toMatchObject({
      storeNameEn: "PAK'nSAVE Albany",
      storeNameZh: "派克储蓄 奥尔巴尼",
    });
  });

  it("names a purchase at an unknown-branch Store after its chain alone", async () => {
    const mock = fakeClient({
      data: [
        row({
          receipts: {
            purchase_date: "2026-08-01",
            store_id: "store-costco",
            store_name_en: "COSTCO WHOLESALE NZ LTD",
            store_name_zh: "好市多批发",
            stores: { chain_name_en: "Costco", chain_name_zh: "好市多", branch_name_en: null, branch_name_zh: null },
          },
        }),
      ],
      error: null,
    });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases[0]).toMatchObject({ storeNameEn: "Costco", storeNameZh: "好市多" });
  });

  it("drops rows with no unit spec, since no consumer can normalize them", async () => {
    const mock = fakeClient({
      data: [
        row({ unit_spec_value: null }),
        row({ unit_spec_unit: null }),
        row({ unit_price: 7 }),
      ],
      error: null,
    });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases).toHaveLength(1);
    expect(history.purchases[0].unitPrice).toBe(7);
  });

  it("de-duplicates repeated product ids", async () => {
    const mock = fakeClient({ data: [row()], error: null });

    const histories = await fetchPurchaseHistories(mock.client, ["p1", "p1"]);

    expect(mock.callsFor("receipt_items")).toContainEqual(["in", "product_id", ["p1"]]);
    expect(histories).toHaveLength(1);
  });

  it("skips the query entirely when there are no products to look up", async () => {
    const mock = fakeClient({ data: [], error: null });

    const histories = await fetchPurchaseHistories(mock.client, []);

    expect(histories).toEqual([]);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("throws the Supabase error rather than returning a partial history", async () => {
    const mock = fakeClient({ data: null, error: new Error("boom") });

    await expect(fetchPurchaseHistories(mock.client, ["p1"])).rejects.toThrow("boom");
  });

  // CONTEXT.md, Bilingual Name: a store with no Translation reads back as its
  // Source Text, so store comparison never shows a blank store.
  it("reads a store with no Chinese translation back as its English source text", async () => {
    const mock = fakeClient({
      data: [
        row({
          receipts: {
            purchase_date: "2026-08-01",
            store_name_en: "Four Square",
            store_name_zh: null,
          },
        }),
      ],
      error: null,
    });

    const [history] = await fetchPurchaseHistories(mock.client, ["p1"]);

    expect(history.purchases[0].storeNameZh).toBe("Four Square");
  });

});
