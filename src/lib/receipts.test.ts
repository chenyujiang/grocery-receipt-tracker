import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token / reads / writes), fetch (for the /api
// call), and imageResize (a browser Image/Canvas wrapper, not testable
// under jsdom — see its own file) are the external boundaries — mock them
// here, not the behavior we're testing (Section 6: photo upload, preview,
// and confirm).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn(), getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));
vi.mock("@/lib/imageResize", () => ({
  resizeImageForUpload: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
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

  it("sends the resized image and access token to the backend, and returns the receiptId", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-1" } },
      error: null,
    } as never);
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
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow("Not signed in");
    expect(fetch).not.toHaveBeenCalled();
    expect(resizeImageForUpload).not.toHaveBeenCalled();
  });

  it("throws with the server's error message when the upload fails", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-1" } },
      error: null,
    } as never);
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

function selectEqSingleChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select };
}

function selectEqChain(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  return { select };
}

describe("fetchReceiptDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the receipt and its items, including each item's category via its matched product", async () => {
    const receiptsChain = selectEqSingleChain({
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
    });
    const receiptItemsChain = selectEqChain({
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
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipts") return receiptsChain as never;
      if (table === "receipt_items") return receiptItemsChain as never;
      throw new Error(`unexpected table: ${table}`);
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
    const receiptsChain = selectEqSingleChain({
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
    });
    const receiptItemsChain = selectEqChain({
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
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipts") return receiptsChain as never;
      if (table === "receipt_items") return receiptItemsChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.storeNameZh).toBe("Four Square");
    expect(draft.items[0].rawNameZh).toBe("Anchor Blue Milk 2L");
  });

  it("throws when the receipt can't be found", async () => {
    const receiptsChain = selectEqSingleChain({ data: null, error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipts") return receiptsChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

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

function updateEqSelectSingleChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return { update, eq, select, single };
}

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

// confirmReceipt's receipt_items table access serves three purposes: fetch
// the existing row before diffing (select...eq("id",...).single()), write
// the update (update...eq("id",...)), and (for price-spike alerts) read a
// affected product's confirmed history in one go, via fetchPurchaseHistories
// (select...in("product_id",[...]).eq("receipts.status",...).order(...)).
// The history read is the `.in()` branch; `.eq()` is only the single-row read.
function confirmReceiptItemsMock(options: {
  existingRow?: { data: unknown; error: unknown };
  historyResult?: { data: unknown; error: unknown };
  updateError?: unknown;
} = {}) {
  const existingRow = options.existingRow ?? { data: EXISTING_ITEM_ROW, error: null };
  const historyResult = options.historyResult ?? { data: [], error: null };

  const single = vi.fn().mockResolvedValue(existingRow);
  const order = vi.fn().mockResolvedValue(historyResult);
  const eqStatus = vi.fn(() => ({ order }));

  const selectEq = vi.fn((field: string) => {
    if (field === "id") return { single };
    throw new Error(`unexpected select().eq() field: ${field}`);
  });
  const selectIn = vi.fn(() => ({ eq: eqStatus }));
  const select = vi.fn(() => ({ eq: selectEq, in: selectIn }));

  const updateEq = vi.fn().mockResolvedValue({ error: options.updateError ?? null });
  const update = vi.fn(() => ({ eq: updateEq }));

  return { select, selectEq, selectIn, single, eqStatus, order, update, updateEq };
}

describe("confirmReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  it("writes each item's edited fields, then marks the receipt confirmed", async () => {
    const itemsChain = confirmReceiptItemsMock();
    const receiptsChain = updateEqSelectSingleChain({
      data: { circle_id: "circle-1" },
      error: null,
    });
    const editLogsInsert = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: editLogsInsert } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE]);

    expect(itemsChain.update).toHaveBeenCalledWith({
      raw_name_en: "Anchor Blue Milk 2L",
      raw_name_zh: "安科蓝带牛奶 2升",
      quantity: 1,
      unit_spec_value: 2,
      unit_spec_unit: "L",
      unit_price: 4.2,
      original_price: null,
      is_promotion: false,
      subtotal: 4.2,
    });
    expect(itemsChain.updateEq).toHaveBeenCalledWith("id", "item-1");
    expect(receiptsChain.update).toHaveBeenCalledWith({ status: "confirmed" });
    expect(receiptsChain.eq).toHaveBeenCalledWith("id", "receipt-1");
    // Nothing actually changed vs. EXISTING_ITEM_ROW, so no EditLog entries.
    expect(editLogsInsert).not.toHaveBeenCalled();
  });

  it("logs each changed field to EditLog before writing the update", async () => {
    const itemsChain = confirmReceiptItemsMock({
      existingRow: {
        data: { ...EXISTING_ITEM_ROW, raw_name_en: "Anchor Milk", quantity: 2 },
        error: null,
      },
    });
    const receiptsChain = updateEqSelectSingleChain({
      data: { circle_id: "circle-1" },
      error: null,
    });
    const editLogsInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: editLogsInsert } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE]);

    expect(editLogsInsert).toHaveBeenCalledWith([
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
    ]);
  });

  it("does not mark the receipt confirmed if an item update fails", async () => {
    const itemsChain = confirmReceiptItemsMock({ updateError: new Error("RLS denied") });
    const receiptsUpdate = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return { update: receiptsUpdate } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE])).rejects.toThrow("RLS denied");
    expect(receiptsUpdate).not.toHaveBeenCalled();
  });

  it("records a price_spike alert when a confirmed item's price exceeds the 15% threshold", async () => {
    const itemsChain = confirmReceiptItemsMock({
      historyResult: {
        data: [
          { product_id: "product-1", unit_price: 4.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-01", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
          { product_id: "product-1", unit_price: 5.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-20", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
        ],
        error: null,
      },
    });
    const receiptsChain = updateEqSelectSingleChain({
      data: { circle_id: "circle-9" },
      error: null,
    });
    const alertsInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "alerts") return { insert: alertsInsert } as never;
      if (table === "edit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 5.0 },
    ]);

    expect(itemsChain.selectIn).toHaveBeenCalledWith("product_id", ["product-1"]);
    expect(itemsChain.eqStatus).toHaveBeenCalledWith("receipts.status", "confirmed");
    expect(alertsInsert).toHaveBeenCalledWith([
      {
        circle_id: "circle-9",
        type: "price_spike",
        product_id: "product-1",
        receipt_id: "receipt-1",
        new_price: 5.0,
        change_percent: 25,
      },
    ]);
  });

  it("does not record an alert when the price change is within the threshold", async () => {
    const itemsChain = confirmReceiptItemsMock({
      historyResult: {
        data: [
          { product_id: "product-1", unit_price: 4.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-01", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
          { product_id: "product-1", unit_price: 4.1, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-20", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
        ],
        error: null,
      },
    });
    const receiptsChain = updateEqSelectSingleChain({
      data: { circle_id: "circle-9" },
      error: null,
    });
    const alertsInsert = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "alerts") return { insert: alertsInsert } as never;
      if (table === "edit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 4.1 },
    ]);

    expect(alertsInsert).not.toHaveBeenCalled();
  });

  // Under the old one-query-per-product loop this test was unaffordable: each
  // extra product needed its own mock chain spliced into the `from` sequence,
  // which is why the multi-product path had never actually run. It is now a
  // single history chain no matter how many products are involved.
  it("checks every affected product in one query and alerts on each spiking one", async () => {
    const itemsChain = confirmReceiptItemsMock({
      historyResult: {
        data: [
          { product_id: "product-1", unit_price: 4.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-01", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
          { product_id: "product-2", unit_price: 4.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-01", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
          { product_id: "product-1", unit_price: 5.0, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-20", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
          { product_id: "product-2", unit_price: 4.1, quantity: 1, unit_spec_value: 2, unit_spec_unit: "L", is_promotion: false, receipts: { purchase_date: "2026-07-20", store_name_en: "Countdown", store_name_zh: "倒数超市" } },
        ],
        error: null,
      },
    });
    const receiptsChain = updateEqSelectSingleChain({
      data: { circle_id: "circle-9" },
      error: null,
    });
    const alertsInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "alerts") return { insert: alertsInsert } as never;
      if (table === "edit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, id: "item-1", productId: "product-1", unitPrice: 5.0 },
      { ...SAMPLE_ITEM_UPDATE, id: "item-2", productId: "product-2", unitPrice: 4.1 },
    ]);

    expect(itemsChain.selectIn).toHaveBeenCalledTimes(1);
    expect(itemsChain.selectIn).toHaveBeenCalledWith("product_id", ["product-1", "product-2"]);
    expect(alertsInsert).toHaveBeenCalledWith([
      expect.objectContaining({ product_id: "product-1", new_price: 5.0, change_percent: 25 }),
    ]);
  });
});

// Issue 16: editing a confirmed receipt reuses the same per-item
// diff-then-log-then-update logic as confirmReceipt, plus its own
// diff-then-log-then-update for the receipt-level purchase_date — but never
// touches status or price-spike alerts.
function receiptDateChainMock(
  options: { existingRow?: { data: unknown; error: unknown }; updateError?: unknown } = {}
) {
  const existingRow = options.existingRow ?? { data: { purchase_date: "2026-08-05" }, error: null };
  const single = vi.fn().mockResolvedValue(existingRow);
  const selectEq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn().mockResolvedValue({ error: options.updateError ?? null });
  const update = vi.fn(() => ({ eq: updateEq }));
  return { select, selectEq, single, update, updateEq };
}

describe("editConfirmedReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  it("writes each item's edited fields without touching status or alerts", async () => {
    const itemsChain = confirmReceiptItemsMock();
    const receiptsChain = receiptDateChainMock();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(itemsChain.update).toHaveBeenCalledWith({
      raw_name_en: "Anchor Blue Milk 2L",
      raw_name_zh: "安科蓝带牛奶 2升",
      quantity: 1,
      unit_spec_value: 2,
      unit_spec_unit: "L",
      unit_price: 4.2,
      original_price: null,
      is_promotion: false,
      subtotal: 4.2,
    });
    expect(receiptsChain.update).not.toHaveBeenCalled();
  });

  it("logs each changed item field to EditLog, same as confirmReceipt", async () => {
    const itemsChain = confirmReceiptItemsMock({
      existingRow: { data: { ...EXISTING_ITEM_ROW, quantity: 2 }, error: null },
    });
    const receiptsChain = receiptDateChainMock();
    const editLogsInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: editLogsInsert } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(editLogsInsert).toHaveBeenCalledWith([
      { receipt_item_id: "item-1", field_name: "quantity", old_value: "2", new_value: "1", edited_by: "user-1" },
    ]);
  });

  it("updates and logs the purchase date when it changed", async () => {
    const itemsChain = confirmReceiptItemsMock();
    const receiptsChain = receiptDateChainMock({
      existingRow: { data: { purchase_date: "2026-06-05" }, error: null },
    });
    const editLogsInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: editLogsInsert } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(receiptsChain.update).toHaveBeenCalledWith({ purchase_date: "2026-08-05" });
    expect(receiptsChain.updateEq).toHaveBeenCalledWith("id", "receipt-1");
    expect(editLogsInsert).toHaveBeenCalledWith({
      receipt_id: "receipt-1",
      field_name: "purchase_date",
      old_value: "2026-06-05",
      new_value: "2026-08-05",
      edited_by: "user-1",
    });
  });

  it("does not touch the receipt row when the purchase date is unchanged", async () => {
    const itemsChain = confirmReceiptItemsMock();
    const receiptsChain = receiptDateChainMock({
      existingRow: { data: { purchase_date: "2026-08-05" }, error: null },
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
      if (table === "edit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE]);

    expect(receiptsChain.update).not.toHaveBeenCalled();
  });
});

describe("deleteReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDeleteRow(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const del = vi.fn(() => ({ eq }));
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as never);
    return { del, eq, select, single };
  }

  it("deletes the receipt row (receipt_items cascade via the FK) and its stored image", async () => {
    mockDeleteRow({ data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.storage.from).mockReturnValue({ remove } as never);

    await deleteReceipt("receipt-1");

    expect(supabase.from).toHaveBeenCalledWith("receipts");
    expect(supabase.storage.from).toHaveBeenCalledWith("receipts");
    expect(remove).toHaveBeenCalledWith(["circle-1/receipt-1.jpg"]);
  });

  it("skips storage cleanup when the receipt had no stored image", async () => {
    mockDeleteRow({ data: { original_image_url: null }, error: null });

    await deleteReceipt("receipt-1");

    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("throws when the row delete fails", async () => {
    mockDeleteRow({ data: null, error: new Error("network error") });

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("network error");
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("throws when the row is deleted but the storage cleanup fails", async () => {
    mockDeleteRow({ data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: new Error("storage error") });
    vi.mocked(supabase.storage.from).mockReturnValue({ remove } as never);

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("storage error");
  });
});
