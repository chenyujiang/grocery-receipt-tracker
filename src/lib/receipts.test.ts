import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token / reads / writes) and fetch (for the /api
// call) are the external boundaries — mock them here, not the behavior
// we're testing (Section 6: photo upload, preview, and confirm).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { uploadReceipt, fetchReceiptDraft, confirmReceipt } from "@/lib/receipts";

function makeFile(content: string, type: string) {
  return new File([content], "receipt.jpg", { type });
}

describe("uploadReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends the image and access token to the backend, and returns the receiptId", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-1" } },
      error: null,
    } as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ receiptId: "receipt-1" }),
    } as never);

    const result = await uploadReceipt(makeFile("fake-image-bytes", "image/jpeg"));

    expect(result).toEqual({ receiptId: "receipt-1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/receipts/recognize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        }),
      })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.mediaType).toBe("image/jpeg");
    expect(typeof body.imageBase64).toBe("string");
    expect(body.imageBase64.length).toBeGreaterThan(0);
  });

  it("throws when there is no active session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow("Not signed in");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws with the server's error message when the upload fails", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-1" } },
      error: null,
    } as never);
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

  it("throws when the receipt can't be found", async () => {
    const receiptsChain = selectEqSingleChain({ data: null, error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipts") return receiptsChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(fetchReceiptDraft("missing-receipt")).rejects.toThrow("Receipt not found");
  });
});

function updateEqChain(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn(() => ({ eq }));
  return { update, eq };
}

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
};

describe("confirmReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes each item's edited fields, then marks the receipt confirmed", async () => {
    const itemsChain = updateEqChain({ error: null });
    const receiptsChain = updateEqChain({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return receiptsChain as never;
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
    expect(itemsChain.eq).toHaveBeenCalledWith("id", "item-1");
    expect(receiptsChain.update).toHaveBeenCalledWith({ status: "confirmed" });
    expect(receiptsChain.eq).toHaveBeenCalledWith("id", "receipt-1");
  });

  it("does not mark the receipt confirmed if an item update fails", async () => {
    const itemsChain = updateEqChain({ error: new Error("RLS denied") });
    const receiptsUpdate = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "receipt_items") return itemsChain as never;
      if (table === "receipts") return { update: receiptsUpdate } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE])).rejects.toThrow("RLS denied");
    expect(receiptsUpdate).not.toHaveBeenCalled();
  });
});
