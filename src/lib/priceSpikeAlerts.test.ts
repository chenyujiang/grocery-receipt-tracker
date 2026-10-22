import { describe, it, expect } from "vitest";
import { detectPriceSpikes } from "@/lib/priceSpikeAlerts";
import type { Purchase } from "@/lib/purchaseHistory";

// detectPriceSpikes only reads the price-shaped fields of a Purchase; the rest
// are filled in here so the fixtures are the real shape the fetch returns,
// not a hand-trimmed subset of it.
function purchase(
  fields: Pick<Purchase, "unitPrice" | "specValue" | "specUnit" | "isPromotion"> &
    Partial<Pick<Purchase, "purchaseDate" | "storeId" | "receiptId">>
): Purchase {
  return {
    purchaseDate: "2026-08-01",
    // By default every purchase is the Receipt being confirmed's own.
    receiptId: "receipt-1",
    storeId: "hornby",
    storeNameEn: "Woolworths Hornby",
    storeNameZh: "Woolworths Hornby",
    storeShortNameEn: "Hornby", storeShortNameZh: "Hornby",
    quantity: 1,
    ...fields,
  };
}

// The Receipt being confirmed: its own Store is the only one compared against.
const receipt = { id: "receipt-1", storeId: "hornby", purchaseDate: "2026-08-01" };
// A purchase on an earlier receipt, a baseline for this Receipt's own.
const EARLIER = { receiptId: "receipt-july", purchaseDate: "2026-07-01" };

describe("detectPriceSpikes", () => {
  it("flags a product whose price change exceeds the 15% threshold", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [
          purchase({ ...EARLIER, unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
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
          purchase({ ...EARLIER, unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
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
          purchase({ ...EARLIER, unitPrice: 4.1, specValue: 2, specUnit: "L", isPromotion: false }),
        ],
      },
      {
        productId: "spiking-product",
        purchases: [
          purchase({ ...EARLIER, unitPrice: 2.0, specValue: 500, specUnit: "g", isPromotion: false }),
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
            purchase({ ...EARLIER, storeId: "riccarton", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
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
            purchase({ ...EARLIER, storeId: "hornby", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ ...EARLIER, storeId: "riccarton", unitPrice: 2.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ ...EARLIER, storeId: "riccarton", unitPrice: 3.0, specValue: 2, specUnit: "L", isPromotion: false }),
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
  // A Receipt confirmed late, dated before purchases already confirmed at its
  // Store, is judged against what came before it — not against later
  // purchases it has nothing to do with.
  it("judges a backdated Receipt against earlier purchases, not the later ones already confirmed", () => {
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ receiptId: "receipt-july", purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            // The backdated Receipt: +5% on July, nowhere near a spike.
            purchase({ purchaseDate: "2026-08-01", unitPrice: 4.2, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ receiptId: "receipt-september", purchaseDate: "2026-09-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([]);
  });
  it("still flags a backdated Receipt that rose past 15% on the purchase before it, at its own price", () => {
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ receiptId: "receipt-july", purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            // The backdated Receipt: +25% on July.
            purchase({ purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ receiptId: "receipt-september", purchaseDate: "2026-09-01", unitPrice: 5.1, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });

  // The alert is this Receipt's: its "current" price has to be this Receipt's
  // own purchase. A promotional one is never either end of the comparison, so
  // the July rise — already alerted when July's receipt was confirmed — must
  // not be raised again against this one.
  it("raises nothing when this Receipt's own purchase was a promotion, even if earlier purchases rose", () => {
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ receiptId: "receipt-june", purchaseDate: "2026-06-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ receiptId: "receipt-july", purchaseDate: "2026-07-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ purchaseDate: "2026-08-01", unitPrice: 3.0, specValue: 2, specUnit: "L", isPromotion: true }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([]);
  });

  it("judges this Receipt's own purchase, not another receipt's at the same Store on the same date", () => {
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ receiptId: "receipt-july", purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            // This Receipt: +25% on July.
            purchase({ purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
            // A second trip to the same Store that day, sorted after it.
            purchase({ receiptId: "receipt-same-day", purchaseDate: "2026-08-01", unitPrice: 5.2, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });

  // Two trips to the same Store on one day can't be told apart in time, so a
  // same-day purchase on another receipt is never the baseline — whichever
  // order the fetch happened to return them in.
  it("compares against the last earlier day's purchase, not another receipt's from the same day sorted before it", () => {
    const spikes = detectPriceSpikes(
      [
        {
          productId: "product-1",
          purchases: [
            purchase({ receiptId: "receipt-july", purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false }),
            purchase({ receiptId: "receipt-same-day", purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
            // This Receipt: +25% on July, though level with the same-day one.
            purchase({ purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }),
          ],
        },
      ],
      receipt
    );

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });
});
