import { describe, it, expect } from "vitest";
import { compareStores } from "@/lib/storeComparison";

describe("compareStores", () => {
  it("compares each store's latest normal-price purchase, cheapest first", () => {
    const entries = compareStores([
      {
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-01",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
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
        storeNameEn: "Pak'nSave",
        storeNameZh: "帕克超市",
        basis: "per_100g",
        value: 0.8,
        purchaseDate: "2026-07-10",
      },
      {
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
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-07-01",
        unitPrice: 5.0,
        specValue: 500,
        specUnit: "g",
        isPromotion: false,
      },
      {
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
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        basis: "per_100g",
        value: 1,
        purchaseDate: "2026-07-01",
      },
    ]);
  });

  it("returns an empty array when there's no purchase history", () => {
    expect(compareStores([])).toEqual([]);
  });
});
