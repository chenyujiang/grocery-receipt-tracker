import { describe, it, expect } from "vitest";
import { compareStores } from "@/lib/storeComparison";

describe("compareStores", () => {
  it("compares each store's latest normal-price purchase, cheapest first", () => {
    const entries = compareStores([
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-01",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "paknsave",
        storeNameEn: "Pak'nSave",
        storeNameZh: "帕克超市",
        purchaseDate: "2026-07-10",
        unitPrice: 4.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
    ]);

    expect(entries).toEqual([
      {
        storeId: "paknsave",
        storeNameEn: "Pak'nSave",
        storeNameZh: "帕克超市",
        basis: "per_100g",
        value: 0.8,
        purchaseDate: "2026-07-10",
      },
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        basis: "per_100g",
        value: 1,
        purchaseDate: "2026-07-01",
      },
    ]);
  });

  it("skips a store's promotional purchase and falls back to its latest normal-price one", () => {
    const entries = compareStores([
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-01",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-20",
        unitPrice: 2.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: true,
      },
    ]);

    expect(entries).toEqual([
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        basis: "per_100g",
        value: 1,
        purchaseDate: "2026-07-01",
      },
    ]);
  });

  // Issue 29: a Store is a branch, and the printed header is only how one
  // receipt happened to spell it — so the header text can neither split one
  // branch nor merge two.
  it("groups purchases by Store, not by the store name printed on the receipt", () => {
    const entries = compareStores([
      {
        storeId: "hornby",
        storeNameEn: "Woolworths",
        storeNameZh: "沃尔沃斯",
        purchaseDate: "2026-07-01",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "riccarton",
        storeNameEn: "Woolworths",
        storeNameZh: "沃尔沃斯",
        purchaseDate: "2026-07-05",
        unitPrice: 4.5,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "albany",
        storeNameEn: "Pak n Save Albany",
        storeNameZh: "帕克超市 奥尔巴尼店",
        purchaseDate: "2026-07-02",
        unitPrice: 4.4,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "albany",
        storeNameEn: "PAK'nSAVE Albany",
        storeNameZh: "帕克超市 奥尔巴尼店",
        purchaseDate: "2026-07-12",
        unitPrice: 4.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
    ]);

    // Cheapest first: Albany's latest is $4.00, Riccarton's $4.50, Hornby's $5.00.
    expect(entries.map((entry) => entry.storeId)).toEqual(["albany", "riccarton", "hornby"]);
  });

  // Same rule as the Same-Store Price Change: purchases with no Store would
  // pool several real shops' prices into one misleading "unknown" entry.
  it("skips purchases with no Store", () => {
    const entries = compareStores([
      {
        storeId: null,
        storeNameEn: "Some Supermarket",
        storeNameZh: "某超市",
        purchaseDate: "2026-07-01",
        unitPrice: 3.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
        storeId: "countdown",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-05",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
    ]);

    expect(entries.map((entry) => entry.storeId)).toEqual(["countdown"]);
  });

  it("returns an empty array when there's no purchase history", () => {
    expect(compareStores([])).toEqual([]);
  });
});
