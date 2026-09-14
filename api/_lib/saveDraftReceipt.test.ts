import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (Sections 3.2, 5.2, 5.3, 8, 9: writing the
// pending_review draft, and creating a new Product when nothing matched).
vi.mock("./supabaseAdmin", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { saveDraftReceipt } from "./saveDraftReceipt";
import type { RecognizedReceipt } from "./recognizeReceipt";

function baseReceipt(overrides: Partial<RecognizedReceipt> = {}): RecognizedReceipt {
  return {
    storeNameEn: "Countdown Newmarket",
    storeNameZh: "倒数超市 Newmarket 店",
    purchaseDate: "2026-08-01",
    totalAmount: 4.5,
    items: [
      {
        rawNameEn: "Anchor Blue Milk 2L",
        rawNameZh: "安科蓝带牛奶 2升",
        quantity: 1,
        unitSpecValue: 2,
        unitSpecUnit: "L",
        unitPrice: 4.5,
        originalPrice: null,
        isPromotion: false,
        subtotal: 4.5,
        category: "Food - Dairy & Bakery",
        matchedProductId: "existing-product-1",
      },
    ],
    ...overrides,
  };
}

describe("saveDraftReceipt", () => {
  it("saves the receipt as pending_review and reuses matchedProductId when already matched", async () => {
    // `products` is left unprepared: an already-matched item must not
    // create a Product, and reaching for the table at all would throw.
    const db = installFakeSupabase(supabaseAdmin, {
      tables: {
        receipts: { data: { id: "receipt-1" }, error: null },
        receipt_items: { error: null },
      },
    });

    const result = await saveDraftReceipt({
      circleId: "circle-1",
      uploadedBy: "eason@example.com",
      originalImageUrl: "https://storage.example/receipt-1.jpg",
      receipt: baseReceipt(),
    });

    expect(result).toEqual({ receiptId: "receipt-1" });
    expect(db.callsFor("receipts")).toContainEqual([
      "insert",
      {
      circle_id: "circle-1",
      uploaded_by: "eason@example.com",
      store_name_en: "Countdown Newmarket",
      store_name_zh: "倒数超市 Newmarket 店",
      purchase_date: "2026-08-01",
      total_amount: 4.5,
      original_image_url: "https://storage.example/receipt-1.jpg",
        status: "pending_review",
      },
    ]);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "insert",
      [
      {
        receipt_id: "receipt-1",
        raw_name_en: "Anchor Blue Milk 2L",
        raw_name_zh: "安科蓝带牛奶 2升",
        product_id: "existing-product-1",
        quantity: 1,
        unit_spec_value: 2,
        unit_spec_unit: "L",
        unit_price: 4.5,
        original_price: null,
        is_promotion: false,
          subtotal: 4.5,
        },
      ],
    ]);
    expect(db.callsFor("products")).toEqual([]);
  });

  it("creates a new Product from the AI's category suggestion when an item has no match", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      tables: {
        receipts: { data: { id: "receipt-2" }, error: null },
        products: { data: { id: "new-product-9" }, error: null },
        receipt_items: { error: null },
      },
    });

    await saveDraftReceipt({
      circleId: "circle-1",
      uploadedBy: "eason@example.com",
      originalImageUrl: null,
      receipt: baseReceipt({
        items: [
          {
            rawNameEn: "Vogel's Bread",
            rawNameZh: "沃格尔面包",
            quantity: 1,
            unitSpecValue: 700,
            unitSpecUnit: "g",
            unitPrice: 5.2,
            originalPrice: null,
            isPromotion: false,
            subtotal: 5.2,
            category: "Food - Dairy & Bakery",
            matchedProductId: null,
          },
        ],
      }),
    });

    expect(db.callsFor("products")).toContainEqual([
      "insert",
      {
        circle_id: "circle-1",
        canonical_name_en: "Vogel's Bread",
        canonical_name_zh: "沃格尔面包",
        category: "Food - Dairy & Bakery",
      },
    ]);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "insert",
      [expect.objectContaining({ product_id: "new-product-9" })],
    ]);
  });
});
