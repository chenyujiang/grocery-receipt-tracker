import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (Sections 3.2, 5.2, 5.3, 8, 9: writing the
// pending_review draft, and creating a new Product when nothing matched).
vi.mock("./supabaseAdmin.js", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin.js";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { saveDraftReceipt } from "./saveDraftReceipt";
import type { RecognizedItem, RecognizedReceipt } from "./recognizeReceipt";

function milk(overrides: Partial<RecognizedItem> = {}): RecognizedItem {
  return {
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
    ...overrides,
  };
}

function bread(overrides: Partial<RecognizedItem> = {}): RecognizedItem {
  return {
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
    ...overrides,
  };
}

function baseReceipt(overrides: Partial<RecognizedReceipt> = {}): RecognizedReceipt {
  return {
    storeNameEn: "Countdown Newmarket",
    storeNameZh: "倒数超市 Newmarket 店",
    chainNameEn: "Countdown",
    chainNameZh: "倒数超市",
    branchNameEn: "Newmarket",
    branchNameZh: "Newmarket 店",
    purchaseDate: "2026-08-01",
    totalAmount: 4.5,
    items: [milk()],
    ...overrides,
  };
}

const SAVED = { save_draft_receipt: { data: "receipt-1", error: null } };

// Ticket 33: the receipt, its new Products and its items are written by one
// Postgres function, so the whole draft commits or none of it does. That
// atomicity lives in the database and can't be observed from here; what this
// suite pins down is that the draft goes out as exactly one RPC call, with
// nothing written table-by-table around it, and what that call carries.
describe("saveDraftReceipt", () => {
  it("saves the whole draft in one RPC call and returns the new receipt's id", async () => {
    // No tables prepared: reaching for `from()` at all would throw.
    const db = installFakeSupabase(supabaseAdmin, { rpc: SAVED });

    const result = await saveDraftReceipt({
      circleId: "circle-1",
      uploadedBy: "eason@example.com",
      originalImageUrl: "https://storage.example/receipt-1.jpg",
      receipt: baseReceipt(),
    });

    expect(result).toEqual({ receiptId: "receipt-1" });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("save_draft_receipt", {
      p_receipt: {
        circle_id: "circle-1",
        uploaded_by: "eason@example.com",
        store_name_en: "Countdown Newmarket",
        store_name_zh: "倒数超市 Newmarket 店",
        // Issue 29: the AI's chain/branch split is kept for the store picker
        // to pre-fill; no Store (store_id) is resolved on draft save.
        recognized_chain_en: "Countdown",
        recognized_chain_zh: "倒数超市",
        recognized_branch_en: "Newmarket",
        recognized_branch_zh: "Newmarket 店",
        purchase_date: "2026-08-01",
        total_amount: 4.5,
        original_image_url: "https://storage.example/receipt-1.jpg",
      },
      // Already matched, so no new Product.
      p_new_products: [],
      p_items: [
        {
          raw_name_en: "Anchor Blue Milk 2L",
          raw_name_zh: "安科蓝带牛奶 2升",
          product_id: "existing-product-1",
          new_product_index: null,
          quantity: 1,
          unit_spec_value: 2,
          unit_spec_unit: "L",
          unit_price: 4.5,
          original_price: null,
          is_promotion: false,
          subtotal: 4.5,
        },
      ],
    });
  });

  it("asks for a new Product from the AI's category suggestion when an item has no match", async () => {
    const db = installFakeSupabase(supabaseAdmin, { rpc: SAVED });

    await saveDraftReceipt({
      circleId: "circle-1",
      uploadedBy: "eason@example.com",
      originalImageUrl: null,
      receipt: baseReceipt({ items: [milk(), bread()] }),
    });

    expect(db.rpc).toHaveBeenCalledWith(
      "save_draft_receipt",
      expect.objectContaining({
        p_new_products: [
          {
            canonical_name_en: "Vogel's Bread",
            canonical_name_zh: "沃格尔面包",
            category: "Food - Dairy & Bakery",
          },
        ],
        p_items: [
          expect.objectContaining({ product_id: "existing-product-1", new_product_index: null }),
          expect.objectContaining({
            raw_name_en: "Vogel's Bread",
            product_id: null,
            new_product_index: 0,
          }),
        ],
      })
    );
  });

  it("creates one Product for two unmatched lines with the same English name, and points both at it", async () => {
    const db = installFakeSupabase(supabaseAdmin, { rpc: SAVED });

    await saveDraftReceipt({
      circleId: "circle-1",
      uploadedBy: "eason@example.com",
      originalImageUrl: null,
      receipt: baseReceipt({
        items: [
          bread(),
          bread({ rawNameEn: " vogel's bread ", rawNameZh: "沃格尔面包（第二行）" }),
          bread({ rawNameEn: "Whittaker's Chocolate", rawNameZh: "惠特克巧克力", category: "Food - Snacks" }),
        ],
      }),
    });

    expect(db.rpc).toHaveBeenCalledWith(
      "save_draft_receipt",
      expect.objectContaining({
        // The first line's spelling, translation and category win.
        p_new_products: [
          {
            canonical_name_en: "Vogel's Bread",
            canonical_name_zh: "沃格尔面包",
            category: "Food - Dairy & Bakery",
          },
          {
            canonical_name_en: "Whittaker's Chocolate",
            canonical_name_zh: "惠特克巧克力",
            category: "Food - Snacks",
          },
        ],
        // Each line keeps its own raw text; only the Product is shared.
        p_items: [
          expect.objectContaining({ raw_name_en: "Vogel's Bread", new_product_index: 0 }),
          expect.objectContaining({ raw_name_en: " vogel's bread ", new_product_index: 0 }),
          expect.objectContaining({ raw_name_en: "Whittaker's Chocolate", new_product_index: 1 }),
        ],
      })
    );
  });

  it("rethrows the database's error as is when the save fails", async () => {
    const failure = { message: "insert or update on table violates foreign key constraint", code: "23503" };
    installFakeSupabase(supabaseAdmin, {
      rpc: { save_draft_receipt: { data: null, error: failure } },
    });

    await expect(
      saveDraftReceipt({
        circleId: "circle-1",
        uploadedBy: "eason@example.com",
        originalImageUrl: null,
        receipt: baseReceipt(),
      })
    ).rejects.toBe(failure);
  });
});
