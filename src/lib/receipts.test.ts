import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token / reads / writes), fetch (for the /api
// call), and imageResize (a browser Image/Canvas wrapper, not testable
// under jsdom — see its own file) are the external boundaries — mock them
// here, not the behavior we're testing (Section 6: photo upload, preview,
// and confirm).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/imageResize", () => ({
  resizeImageForUpload: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { resizeImageForUpload } from "@/lib/imageResize";
import {
  uploadReceipt,
  fetchReceiptDraft,
  confirmReceipt,
  editConfirmedReceipt,
  deleteReceipt,
  toItemUpdate,
} from "@/lib/receipts";
import type { DraftItem } from "@/lib/receipts";

function makeFile(content: string, type: string) {
  return new File([content], "receipt.jpg", { type });
}

/** The methods a table saw, for asserting a write did *not* happen. */
function methodsUsed(calls: Array<[string, ...unknown[]]>) {
  return calls.map(([method]) => method);
}

// Issue 17: the single place that strips `category` on the way from a
// DraftItem to an update payload. The invariant worth pinning down is the
// absence of the key — a field-by-field comparison would still pass if the
// strip broke, since every other field is copied verbatim.
describe("toItemUpdate", () => {
  const DRAFT_ITEM: DraftItem = {
    id: "item-1",
    rawNameEn: "Anchor Blue Milk 2L",
    rawNameZh: "安佳蓝顶牛奶 2升",
    quantity: 1,
    unitSpecValue: 2,
    unitSpecUnit: "L",
    unitPrice: 4.5,
    originalPrice: 5.2,
    isPromotion: true,
    subtotal: 4.5,
    productId: "product-1",
    category: "Food - Dairy & Bakery",
  };

  it("drops category, which belongs to the Product and is never written back through a ReceiptItem", () => {
    expect(toItemUpdate(DRAFT_ITEM)).not.toHaveProperty("category");
  });

  it("carries every other field through untouched", () => {
    const { category: _category, ...rest } = DRAFT_ITEM;

    expect(toItemUpdate(DRAFT_ITEM)).toEqual(rest);
  });
});

describe("uploadReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  // The `fetch` casts below are the HTTP boundary, not the Supabase one.
  it("sends the resized image and access token to the backend, and returns the receiptId", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: { access_token: "tok-1" } }, error: null } },
    });
    vi.mocked(resizeImageForUpload).mockResolvedValue({
      base64: "resized-base64-bytes",
      mediaType: "image/jpeg",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ receiptId: "receipt-1" }),
    } as never);

    const result = await uploadReceipt(makeFile("fake-image-bytes", "image/heic"));

    expect(result).toEqual({ receiptId: "receipt-1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/receipts/recognize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        }),
        body: JSON.stringify({ imageBase64: "resized-base64-bytes", mediaType: "image/jpeg" }),
      })
    );
  });

  it("throws when there is no active session", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: null }, error: null } },
    });

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow("Not signed in");
    expect(fetch).not.toHaveBeenCalled();
    expect(resizeImageForUpload).not.toHaveBeenCalled();
  });

  it("throws with the server's error message when the upload fails", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: { access_token: "tok-1" } }, error: null } },
    });
    vi.mocked(resizeImageForUpload).mockResolvedValue({
      base64: "resized-base64-bytes",
      mediaType: "image/jpeg",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "AI recognition quota used up" }),
    } as never);

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow(
      "AI recognition quota used up"
    );
  });
});

describe("fetchReceiptDraft", () => {
  it("loads the receipt and its items, including each item's category via its matched product", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_name_en: "Countdown Newmarket",
            store_name_zh: "倒数超市 Newmarket 店",
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "pending_review",
            original_image_url: "circle-1/abc.jpg",
          },
          error: null,
        },
        receipt_items: {
          data: [
            {
              id: "item-1",
              raw_name_en: "Anchor Blue Milk 2L",
              raw_name_zh: "安科蓝带牛奶 2升",
              quantity: 1,
              unit_spec_value: 2,
              unit_spec_unit: "L",
              unit_price: 4.5,
              original_price: null,
              is_promotion: false,
              subtotal: 4.5,
              product_id: "product-1",
              products: { category: "Food - Dairy & Bakery" },
            },
          ],
          error: null,
        },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.storeNameEn).toBe("Countdown Newmarket");
    expect(draft.status).toBe("pending_review");
    expect(draft.items).toEqual([
      {
        id: "item-1",
        rawNameEn: "Anchor Blue Milk 2L",
        rawNameZh: "安科蓝带牛奶 2升",
        quantity: 1,
        unitSpecValue: 2,
        unitSpecUnit: "L",
        unitPrice: 4.5,
        originalPrice: null,
        isPromotion: false,
        subtotal: 4.5,
        productId: "product-1",
        category: "Food - Dairy & Bakery",
      },
    ]);
  });

  // CONTEXT.md, Bilingual Name: a Receipt Item or store with no Translation
  // reads back as its Source Text, so the review screen's Chinese fields are
  // never blank.
  it("reads a store and item with no Chinese translation back as their English source text", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_name_en: "Four Square",
            store_name_zh: null,
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "pending_review",
            original_image_url: null,
          },
          error: null,
        },
        receipt_items: {
          data: [
            {
              id: "item-1",
              raw_name_en: "Anchor Blue Milk 2L",
              raw_name_zh: null,
              quantity: 1,
              unit_spec_value: 2,
              unit_spec_unit: "L",
              unit_price: 4.5,
              original_price: null,
              is_promotion: false,
              subtotal: 4.5,
              product_id: null,
              products: null,
            },
          ],
          error: null,
        },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.storeNameZh).toBe("Four Square");
    expect(draft.items[0].rawNameZh).toBe("Anchor Blue Milk 2L");
  });

  it("throws when the receipt can't be found", async () => {
    // `receipt_items` is left unprepared: reading items for a receipt that
    // isn't there would throw rather than pass quietly.
    installFakeSupabase(supabase, { tables: { receipts: { data: null, error: null } } });

    await expect(fetchReceiptDraft("missing-receipt")).rejects.toThrow("Receipt not found");
  });
});

const SAMPLE_ITEM_UPDATE = {
  id: "item-1",
  rawNameEn: "Anchor Blue Milk 2L",
  rawNameZh: "安科蓝带牛奶 2升",
  quantity: 1,
  unitSpecValue: 2,
  unitSpecUnit: "L",
  unitPrice: 4.2,
  originalPrice: null,
  isPromotion: false,
  subtotal: 4.2,
  productId: null,
};

const EXISTING_ITEM_ROW = {
  raw_name_en: SAMPLE_ITEM_UPDATE.rawNameEn,
  raw_name_zh: SAMPLE_ITEM_UPDATE.rawNameZh,
  quantity: SAMPLE_ITEM_UPDATE.quantity,
  unit_spec_value: SAMPLE_ITEM_UPDATE.unitSpecValue,
  unit_spec_unit: SAMPLE_ITEM_UPDATE.unitSpecUnit,
  unit_price: SAMPLE_ITEM_UPDATE.unitPrice,
  original_price: SAMPLE_ITEM_UPDATE.originalPrice,
  is_promotion: SAMPLE_ITEM_UPDATE.isPromotion,
  subtotal: SAMPLE_ITEM_UPDATE.subtotal,
};

// confirmReceipt's receipt_items access serves three purposes, in this order
// per run: read the existing row before diffing, write the update, and then
// (once, for price-spike alerts) read every affected product's confirmed
// history through fetchPurchaseHistories. The queue below is that order.
const EXISTING_ITEM = { data: EXISTING_ITEM_ROW, error: null };
const ITEM_UPDATED = { error: null };
const NO_HISTORY = { data: [], error: null };
const WROTE_OK = { error: null };

function historyRow(productId: string, unitPrice: number, purchaseDate: string) {
  return {
    product_id: productId,
    unit_price: unitPrice,
    quantity: 1,
    unit_spec_value: 2,
    unit_spec_unit: "L",
    is_promotion: false,
    receipts: {
      purchase_date: purchaseDate,
      store_name_en: "Countdown",
      store_name_zh: "倒数超市",
    },
  };
}

const SIGNED_IN = { getUser: { data: { user: { id: "user-1" } }, error: null } };

describe("confirmReceipt", () => {
  it("writes each item's edited fields, then marks the receipt confirmed", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED, NO_HISTORY],
        receipts: [{ data: { circle_id: "circle-1" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE]);

    expect(db.callsFor("receipt_items")).toContainEqual([
      "update",
      {
        raw_name_en: "Anchor Blue Milk 2L",
        raw_name_zh: "安科蓝带牛奶 2升",
        quantity: 1,
        unit_spec_value: 2,
        unit_spec_unit: "L",
        unit_price: 4.2,
        original_price: null,
        is_promotion: false,
        subtotal: 4.2,
      },
    ]);
    expect(db.callsFor("receipt_items")).toContainEqual(["eq", "id", "item-1"]);
    expect(db.callsFor("receipts")).toContainEqual(["update", { status: "confirmed" }]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "id", "receipt-1"]);
    // Nothing actually changed vs. EXISTING_ITEM_ROW, so no EditLog entries.
    expect(db.callsFor("edit_logs")).toEqual([]);
  });

  it("logs each changed field to EditLog before writing the update", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          { data: { ...EXISTING_ITEM_ROW, raw_name_en: "Anchor Milk", quantity: 2 }, error: null },
          ITEM_UPDATED,
          NO_HISTORY,
        ],
        receipts: [{ data: { circle_id: "circle-1" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE]);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_item_id: "item-1",
          field_name: "rawNameEn",
          old_value: "Anchor Milk",
          new_value: "Anchor Blue Milk 2L",
          edited_by: "user-1",
        },
        {
          receipt_item_id: "item-1",
          field_name: "quantity",
          old_value: "2",
          new_value: "1",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("does not mark the receipt confirmed if an item update fails", async () => {
    // `receipts` is left unprepared: touching it at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, { error: new Error("RLS denied") }],
        edit_logs: WROTE_OK,
      },
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE])).rejects.toThrow("RLS denied");
    expect(db.callsFor("receipts")).toEqual([]);
  });

  it("records a price_spike alert when a confirmed item's price exceeds the 15% threshold", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-1", 5.0, "2026-07-20"),
            ],
            error: null,
          },
        ],
        receipts: [{ data: { circle_id: "circle-9" }, error: null }],
        edit_logs: WROTE_OK,
        alerts: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 5.0 },
    ]);

    expect(db.callsFor("receipt_items")).toContainEqual(["in", "product_id", ["product-1"]]);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "eq",
      "receipts.status",
      "confirmed",
    ]);
    expect(db.callsFor("alerts")).toContainEqual([
      "insert",
      [
        {
          circle_id: "circle-9",
          type: "price_spike",
          product_id: "product-1",
          receipt_id: "receipt-1",
          new_price: 5.0,
          change_percent: 25,
        },
      ],
    ]);
  });

  it("does not record an alert when the price change is within the threshold", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-1", 4.1, "2026-07-20"),
            ],
            error: null,
          },
        ],
        receipts: [{ data: { circle_id: "circle-9" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 4.1 },
    ]);

    expect(db.callsFor("alerts")).toEqual([]);
  });

  // Under the old one-query-per-product loop this test was unaffordable: each
  // extra product needed its own mock chain spliced into the `from` sequence,
  // which is why the multi-product path had never actually run. It is now a
  // single history read no matter how many products are involved.
  it("checks every affected product in one query and alerts on each spiking one", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-2", 4.0, "2026-07-01"),
              historyRow("product-1", 5.0, "2026-07-20"),
              historyRow("product-2", 4.1, "2026-07-20"),
            ],
            error: null,
          },
        ],
        receipts: [{ data: { circle_id: "circle-9" }, error: null }],
        edit_logs: WROTE_OK,
        alerts: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, id: "item-1", productId: "product-1", unitPrice: 5.0 },
      { ...SAMPLE_ITEM_UPDATE, id: "item-2", productId: "product-2", unitPrice: 4.1 },
    ]);

    expect(methodsUsed(db.callsFor("receipt_items")).filter((m) => m === "in")).toHaveLength(1);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "in",
      "product_id",
      ["product-1", "product-2"],
    ]);
    expect(db.callsFor("alerts")).toContainEqual([
      "insert",
      [expect.objectContaining({ product_id: "product-1", new_price: 5.0, change_percent: 25 })],
    ]);
  });
});

// Issue 16: editing a confirmed receipt reuses the same per-item
// diff-then-log-then-update logic as confirmReceipt, plus its own
// diff-then-log-then-update for the receipt-level purchase_date — but never
// touches status or price-spike alerts.
describe("editConfirmedReceipt", () => {
  it("writes each item's edited fields without touching status or alerts", async () => {
    // No `alerts` prepared: reaching for it at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [{ data: { purchase_date: "2026-08-05" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(db.callsFor("receipt_items")).toContainEqual([
      "update",
      {
        raw_name_en: "Anchor Blue Milk 2L",
        raw_name_zh: "安科蓝带牛奶 2升",
        quantity: 1,
        unit_spec_value: 2,
        unit_spec_unit: "L",
        unit_price: 4.2,
        original_price: null,
        is_promotion: false,
        subtotal: 4.2,
      },
    ]);
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("update");
  });

  it("logs each changed item field to EditLog, same as confirmReceipt", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          { data: { ...EXISTING_ITEM_ROW, quantity: 2 }, error: null },
          ITEM_UPDATED,
        ],
        receipts: [{ data: { purchase_date: "2026-08-05" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_item_id: "item-1",
          field_name: "quantity",
          old_value: "2",
          new_value: "1",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("updates and logs the purchase date when it changed", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        // Read for the diff, then written because the date differs.
        receipts: [{ data: { purchase_date: "2026-06-05" }, error: null }, WROTE_OK],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(db.callsFor("receipts")).toContainEqual(["update", { purchase_date: "2026-08-05" }]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "id", "receipt-1"]);
    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      {
        receipt_id: "receipt-1",
        field_name: "purchase_date",
        old_value: "2026-06-05",
        new_value: "2026-08-05",
        edited_by: "user-1",
      },
    ]);
  });

  it("does not touch the receipt row when the purchase date is unchanged", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [{ data: { purchase_date: "2026-08-05" }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("update");
  });
});

describe("deleteReceipt", () => {
  it("deletes the receipt row (receipt_items cascade via the FK) and its stored image", async () => {
    const db = installFakeSupabase(supabase, {
      tables: {
        receipts: { data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null },
      },
      storage: { remove: { error: null } },
    });

    await deleteReceipt("receipt-1");

    expect(db.from).toHaveBeenCalledWith("receipts");
    expect(db.storageFrom).toHaveBeenCalledWith("receipts");
    expect(db.storage.remove).toHaveBeenCalledWith(["circle-1/receipt-1.jpg"]);
  });

  it("skips storage cleanup when the receipt had no stored image", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipts: { data: { original_image_url: null }, error: null } },
    });

    await deleteReceipt("receipt-1");

    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("throws when the row delete fails", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipts: { data: null, error: new Error("network error") } },
    });

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("network error");
    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("throws when the row is deleted but the storage cleanup fails", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: { data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null },
      },
      storage: { remove: { error: new Error("storage error") } },
    });

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("storage error");
  });
});
