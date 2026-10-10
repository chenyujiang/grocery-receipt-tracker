import { describe, it, expect } from "vitest";
import { buildPriceTrend } from "@/lib/priceTrend";

const AT_HORNBY = { storeId: "hornby", storeNameEn: "Woolworths Hornby", storeNameZh: "沃尔沃斯 霍恩比店" };
const AT_RICCARTON = {
  storeId: "riccarton",
  storeNameEn: "Woolworths Riccarton",
  storeNameZh: "沃尔沃斯 里卡顿店",
};

describe("buildPriceTrend", () => {
  it("normalizes each purchase's unit price onto a comparable basis, preserving order and promotion flag", () => {
    const points = buildPriceTrend([
      { ...AT_HORNBY, purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
      { ...AT_HORNBY, purchaseDate: "2026-07-15", unitPrice: 3.0, specValue: 500, specUnit: "g", isPromotion: true },
      { ...AT_HORNBY, purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 1, specUnit: "kg", isPromotion: false },
    ]);

    expect(points).toEqual([
      { ...AT_HORNBY, purchaseDate: "2026-07-01", basis: "per_100g", value: 0.8, isPromotion: false },
      { ...AT_HORNBY, purchaseDate: "2026-07-15", basis: "per_100g", value: 0.6, isPromotion: true },
      { ...AT_HORNBY, purchaseDate: "2026-08-01", basis: "per_100g", value: 0.5, isPromotion: false },
    ]);
  });

  // Issue 29: the chart draws one line per Store, so every point says which
  // branch it was bought at — interleaved purchases at two branches come back
  // in the same chronological order, each tagged with its own Store.
  it("tags each point with its Store, so purchases at two branches can be drawn as two lines", () => {
    const points = buildPriceTrend([
      { ...AT_HORNBY, purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
      { ...AT_RICCARTON, purchaseDate: "2026-07-05", unitPrice: 4.5, specValue: 500, specUnit: "g", isPromotion: false },
      { ...AT_HORNBY, purchaseDate: "2026-07-20", unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(points.map(({ storeId, purchaseDate }) => ({ storeId, purchaseDate }))).toEqual([
      { storeId: "hornby", purchaseDate: "2026-07-01" },
      { storeId: "riccarton", purchaseDate: "2026-07-05" },
      { storeId: "hornby", purchaseDate: "2026-07-20" },
    ]);
  });

  // The chart's legend names each line's Store.
  it("carries each point's Store name, for the chart's legend", () => {
    const [point] = buildPriceTrend([
      { ...AT_HORNBY, purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(point).toMatchObject({ storeNameEn: "Woolworths Hornby", storeNameZh: "沃尔沃斯 霍恩比店" });
  });

  it("returns an empty array for no purchase history", () => {
    expect(buildPriceTrend([])).toEqual([]);
  });
});
