import { describe, it, expect } from "vitest";
import { detectPriceSpikes } from "@/lib/priceSpikeAlerts";
import type { Purchase } from "@/lib/purchaseHistory";

// detectPriceSpikes only reads the price-shaped fields of a Purchase; the rest
// are filled in here so the fixtures are the real shape the fetch returns,
// not a hand-trimmed subset of it.
function purchase(
  fields: Pick<Purchase, "unitPrice" | "specValue" | "specUnit" | "isPromotion"> &
    Partial<Pick<Purchase, "purchaseDate" | "storeId">>
): Purchase {
  return {
    purchaseDate: "2026-08-01",
    storeId: "hornby",
    storeNameEn: "Woolworths Hornby",
    storeNameZh: "Woolworths Hornby",
    quantity: 1,
    ...fields,
  };
}

// The Receipt being confirmed: its own Store is the only one compared against.
const receipt = { storeId: "hornby", purchaseDate: "2026-08-01" };

describe("detectPriceSpikes", () => {
  it("flags a product whose price change exceeds the 15% threshold", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [
          purchase({ unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
          purchase({ unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
        ],
      },
    ], receipt);

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });

  it("does not flag a product exactly at the 15% threshold (must exceed, not just reach)", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [
          purchase({ unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
          purchase({ unitPrice: 4.6, specValue: 2, specUnit: "L", isPromotion: false }),
        ],
      },
    ], receipt);

    expect(spikes).toEqual([]);
  });

  it("ignores a product with fewer than 2 normal-price purchases", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [purchase({ unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false })],
      },
    ], receipt);

    expect(spikes).toEqual([]);
  });

  it("checks each product independently and only returns the ones that spiked", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "steady-product",
        purchases: [
          purchase({ unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
          purchase({ unitPrice: 4.1, specValue: 2, specUnit: "L", isPromotion: false }),
        ],
      },
      {
        productId: "spiking-product",
        purchases: [
          purchase({ unitPrice: 2.0, specValue: 500, specUnit: "g", isPromotion: false }),
          purchase({ unitPrice: 3.0, specValue: 500, specUnit: "g", isPromotion: false }),
        ],
      },
    ], receipt);

    expect(spikes).toEqual([{ productId: "spiking-product", newPrice: 3.0, changePercent: 50 }]);
  });

  it("raises nothing when the two purchases were at two different Stores", () => {
    // +25% between Riccarton and Hornby is a Store Comparison, not a price rise.
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ storeId: "riccarton", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ storeId: "hornby", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([]);
  });

  it("raises exactly one alert, for the Receipt's own Store, when that Store rose past 15%", () => {
    // Both Stores rose: Hornby +25%, Riccarton +50%. Only Hornby's Receipt is
    // being confirmed, so only Hornby's rise is reported — once, at its price.
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ storeId: "hornby", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ storeId: "riccarton", unitPrice: 2.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ storeId: "riccarton", unitPrice: 3.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ storeId: "hornby", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });

  it("raises nothing when the baseline purchase at that Store is more than 183 days old", () => {
    // +25%, but the baseline is 212 days before this Receipt — that's
    // inflation since the last visit, not a spike worth alerting on.
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ purchaseDate: "2026-01-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([]);
  });

  it("still raises an alert when the baseline is exactly 183 days old (must exceed, not just reach)", () => {
    // 2026-01-30 -> 2026-08-01 is 183 days to the day.
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ purchaseDate: "2026-01-30", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });
});
