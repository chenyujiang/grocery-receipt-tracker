import { describe, it, expect } from "vitest";
import { buildPriceChangeLeaderboard } from "@/lib/priceChangeLeaderboard";

// Every purchase in the single-Store cases below, so the per-Store rule
// leaves their behaviour exactly as it was.
const AT_HORNBY = {
  storeId: "hornby",
  storeNameEn: "Woolworths Hornby",
  storeNameZh: "沃尔沃斯 霍恩比店",
};

describe("buildPriceChangeLeaderboard", () => {
  it("ranks products by biggest price increase, descending", () => {
    const leaderboard = buildPriceChangeLeaderboard([
      {
        productId: "product-1",
        nameEn: "Anchor Blue Milk",
        nameZh: "安科蓝带牛奶",
        purchases: [
          { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...AT_HORNBY, unitPrice: 4.4, specValue: 500, specUnit: "g", isPromotion: false }, // +10%
        ],
      },
      {
        productId: "product-2",
        nameEn: "Sanitarium Weet-Bix",
        nameZh: "全麦饼",
        purchases: [
          { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...AT_HORNBY, unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false }, // +25%
        ],
      },
    ]);

    expect(leaderboard).toEqual([
      { productId: "product-2", nameEn: "Sanitarium Weet-Bix", nameZh: "全麦饼", ...AT_HORNBY, changePercent: 25 },
      { productId: "product-1", nameEn: "Anchor Blue Milk", nameZh: "安科蓝带牛奶", ...AT_HORNBY, changePercent: 10 },
    ]);
  });

  it("excludes products with no change or a price decrease", () => {
    const leaderboard = buildPriceChangeLeaderboard([
      {
        productId: "product-1",
        nameEn: "Steady Product",
        nameZh: "稳定商品",
        purchases: [
          { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        ],
      },
      {
        productId: "product-2",
        nameEn: "Cheaper Product",
        nameZh: "降价商品",
        purchases: [
          { ...AT_HORNBY, unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        ],
      },
    ]);

    expect(leaderboard).toEqual([]);
  });

  it("gives a product that rose at several branches one row, for its biggest rise, naming that branch", () => {
    const hornby = { storeId: "hornby", storeNameEn: "Woolworths Hornby", storeNameZh: "沃尔沃斯 霍恩比店" };
    const riccarton = {
      storeId: "riccarton",
      storeNameEn: "Woolworths Riccarton",
      storeNameZh: "沃尔沃斯 里卡顿店",
    };
    const leaderboard = buildPriceChangeLeaderboard([
      {
        productId: "product-1",
        nameEn: "Anchor Blue Milk",
        nameZh: "安科蓝带牛奶",
        purchases: [
          { ...hornby, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...riccarton, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { ...hornby, unitPrice: 4.4, specValue: 500, specUnit: "g", isPromotion: false }, // +10%
          { ...riccarton, unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false }, // +25%
        ],
      },
    ]);

    expect(leaderboard).toEqual([
      {
        productId: "product-1",
        nameEn: "Anchor Blue Milk",
        nameZh: "安科蓝带牛奶",
        storeId: "riccarton",
        storeNameEn: "Woolworths Riccarton",
        storeNameZh: "沃尔沃斯 里卡顿店",
        changePercent: 25,
      },
    ]);
  });

  it("caps the result at the given limit", () => {
    const histories = Array.from({ length: 8 }, (_, i) => ({
      productId: `product-${i}`,
      nameEn: `Product ${i}`,
      nameZh: `商品${i}`,
      purchases: [
        { ...AT_HORNBY, unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        { ...AT_HORNBY, unitPrice: 4.0 + i, specValue: 500, specUnit: "g", isPromotion: false },
      ],
    }));

    expect(buildPriceChangeLeaderboard(histories, 5)).toHaveLength(5);
  });
});
