import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts is the boundary — its own Supabase behavior is already
// covered by receipts.test.ts; this only checks the page's read-only
// rendering of a confirmed receipt's line items.
vi.mock("@/lib/receipts", () => ({
  fetchReceiptDraft: vi.fn(),
}));

import { fetchReceiptDraft } from "@/lib/receipts";
import ReceiptDetail from "@/pages/ReceiptDetail";

const SAMPLE_DRAFT = {
  id: "receipt-1",
  storeNameEn: "Countdown Newmarket",
  storeNameZh: "倒数超市 Newmarket 店",
  purchaseDate: "2026-08-01",
  totalAmount: 4.5,
  status: "confirmed",
  originalImageUrl: null,
  items: [
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
  ],
};

function renderDetailPage() {
  return render(
    <MemoryRouter initialEntries={["/receipts/receipt-1"]}>
      <Routes>
        <Route path="/receipts/:receiptId" element={<ReceiptDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ReceiptDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays a confirmed receipt's line items, read-only", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderDetailPage();

    expect(await screen.findByText("Countdown Newmarket")).toBeInTheDocument();
    expect(screen.getByText("Anchor Blue Milk 2L")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchReceiptDraft).mockRejectedValue(new Error("network error"));

    renderDetailPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
