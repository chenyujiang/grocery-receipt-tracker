import { describe, it, expect } from "vitest";
import { buildPriceChangeLeaderboard } from "@/lib/priceChangeLeaderboard";

describe("buildPriceChangeLeaderboard", () => {
  it("ranks products by biggest price increase, descending", () => {
    const leaderboard = buildPriceChangeLeaderboard([
      {
        productId: "product-1",
        nameEn: "Anchor Blue Milk",
        nameZh: "安科蓝带牛奶",
        records: [
          { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { unitPrice: 4.4, specValue: 500, specUnit: "g", isPromotion: false }, // +10%
        ],
      },
      {
        productId: "product-2",
        nameEn: "Sanitarium Weet-Bix",
        nameZh: "全麦饼",
        records: [
          { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false }, // +25%
        ],
      },
    ]);

    expect(leaderboard).toEqual([
      { productId: "product-2", nameEn: "Sanitarium Weet-Bix", nameZh: "全麦饼", changePercent: 25 },
      { productId: "product-1", nameEn: "Anchor Blue Milk", nameZh: "安科蓝带牛奶", changePercent: 10 },
    ]);
  });

  it("excludes products with no change or a price decrease", () => {
    const leaderboard = buildPriceChangeLeaderboard([
      {
        productId: "product-1",
        nameEn: "Steady Product",
        nameZh: "稳定商品",
        records: [
          { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
          { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        ],
      },
      {
        productId: "product-2",
        nameEn: "Cheaper Product",
        nameZh: "降价商品",
        records: [
          { unitPrice: 5.0, specValue: 500, specUnit: "g", isPromotion: false },
          { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        ],
      },
    ]);

    expect(leaderboard).toEqual([]);
  });

  it("caps the result at the given limit", () => {
    const histories = Array.from({ length: 8 }, (_, i) => ({
      productId: `product-${i}`,
      nameEn: `Product ${i}`,
      nameZh: `商品${i}`,
      records: [
        { unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
        { unitPrice: 4.0 + i, specValue: 500, specUnit: "g", isPromotion: false },
      ],
    }));

    expect(buildPriceChangeLeaderboard(histories, 5)).toHaveLength(5);
  });
});
