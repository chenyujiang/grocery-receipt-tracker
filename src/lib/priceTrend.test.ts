import { describe, it, expect } from "vitest";
import { buildPriceTrend, trendLegend, type PriceTrendPoint } from "@/lib/priceTrend";

const AT_HORNBY = {
  storeId: "hornby",
  storeNameEn: "Woolworths Hornby",
  storeNameZh: "沃尔沃斯 霍恩比店",
  storeShortNameEn: "Hornby", storeShortNameZh: "霍恩比店",
};
const AT_RICCARTON = {
  storeId: "riccarton",
  storeNameEn: "Woolworths Riccarton",
  storeNameZh: "沃尔沃斯 里卡顿店",
  storeShortNameEn: "Riccarton", storeShortNameZh: "里卡顿店",
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

    expect(point).toMatchObject({
      storeNameEn: "Woolworths Hornby",
      storeNameZh: "沃尔沃斯 霍恩比店",
      storeShortNameEn: "Hornby", storeShortNameZh: "霍恩比店",
    });
  });

  it("returns an empty array for no purchase history", () => {
    expect(buildPriceTrend([])).toEqual([]);
  });
});

function point(store: Pick<PriceTrendPoint, "storeId" | "storeNameEn" | "storeNameZh" | "storeShortNameEn" | "storeShortNameZh">): PriceTrendPoint {
  return { ...store, purchaseDate: "2026-07-01", basis: "per_100g", value: 1, isPromotion: false };
}

const NO_STORE = {
  storeId: null,
  storeNameEn: "Four Square",
  storeNameZh: "四方超市",
  storeShortNameEn: "Four Square",
  storeShortNameZh: "四方超市",
};
const PAKNSAVE_ALBANY = {
  storeId: "paknsave-albany",
  storeNameEn: "PAK'nSAVE Albany",
  storeNameZh: "PAK'nSAVE 奥尔巴尼店",
  storeShortNameEn: "Albany",
  storeShortNameZh: "奥尔巴尼店",
};
const NEW_WORLD_ALBANY = {
  storeId: "new-world-albany",
  storeNameEn: "New World Albany",
  storeNameZh: "新世界 奥尔巴尼店",
  storeShortNameEn: "Albany",
  storeShortNameZh: "奥尔巴尼店",
};

// Issue 29: the chart's legend names each Store's line.
describe("trendLegend", () => {
  it("lists each Store once, in order of its first purchase, by its short name", () => {
    const legend = trendLegend(
      [point(AT_RICCARTON), point(AT_HORNBY), point(AT_RICCARTON), point(AT_HORNBY)],
      "en"
    );

    expect(legend).toEqual([
      { storeId: "riccarton", label: "Riccarton" },
      { storeId: "hornby", label: "Hornby" },
    ]);
  });

  it("labels in the chosen language", () => {
    expect(trendLegend([point(AT_HORNBY)], "zh")).toEqual([{ storeId: "hornby", label: "霍恩比店" }]);
  });

  // A purchase with no Store belongs to no line, so it has no legend entry.
  it("leaves out purchases with no Store", () => {
    expect(trendLegend([point(NO_STORE), point(AT_HORNBY)], "en")).toEqual([
      { storeId: "hornby", label: "Hornby" },
    ]);
  });

  // Two chains can share a branch name; the branch alone would then label two
  // lines alike.
  it("names Stores that share a short name by chain and branch, leaving the others short", () => {
    expect(
      trendLegend([point(PAKNSAVE_ALBANY), point(NEW_WORLD_ALBANY), point(AT_HORNBY)], "en")
    ).toEqual([
      { storeId: "paknsave-albany", label: "PAK'nSAVE Albany" },
      { storeId: "new-world-albany", label: "New World Albany" },
      { storeId: "hornby", label: "Hornby" },
    ]);
  });

  it("returns no entries when no purchase has a Store", () => {
    expect(trendLegend([point(NO_STORE)], "en")).toEqual([]);
  });
});
