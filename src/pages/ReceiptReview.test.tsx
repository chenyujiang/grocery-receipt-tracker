import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts and @/lib/duplicateCheck are the boundary — their own
// Supabase behavior is already covered by their own test files; this only
// checks the page's UI behavior (loading the draft, editing a field,
// confirming, the duplicate-check banner, navigating away).
vi.mock("@/lib/receipts", () => ({
  fetchReceiptDraft: vi.fn(),
  confirmReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
}));
vi.mock("@/lib/duplicateCheck", () => ({
  findDuplicateReceipt: vi.fn(),
}));

import { fetchReceiptDraft, confirmReceipt, deleteReceipt } from "@/lib/receipts";
import { findDuplicateReceipt } from "@/lib/duplicateCheck";
import ReceiptReview from "@/pages/ReceiptReview";

const SAMPLE_DRAFT = {
  id: "receipt-1",
  uploadedBy: "user-1",
  storeNameEn: "Countdown Newmarket",
  storeNameZh: "倒数超市 Newmarket 店",
  purchaseDate: "2026-08-01",
  totalAmount: 4.5,
  status: "pending_review",
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

function renderReviewPage() {
  return render(
    <MemoryRouter initialEntries={["/receipts/receipt-1/review"]}>
      <Routes>
        <Route path="/receipts/:receiptId/review" element={<ReceiptReview />} />
        <Route path="/" element={<p>Home stub</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ReceiptReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDuplicateReceipt).mockResolvedValue(null);
  });

  it("loads and displays the draft's items", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderReviewPage();

    expect(await screen.findByDisplayValue("Anchor Blue Milk 2L")).toBeInTheDocument();
    // The item has a weight/volume spec (2L) — it should show alongside the category.
    expect(screen.getByText(/2L/)).toBeInTheDocument();
    expect(fetchReceiptDraft).toHaveBeenCalledWith("receipt-1");
  });

  it("lets the user edit a field and confirms with the edited value", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();
    const quantityInput = await screen.findByLabelText(/quantity|数量/i);
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "2");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText("Home stub")).toBeInTheDocument();
    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", [
      expect.objectContaining({ id: "item-1", quantity: 2 }),
    ]);
  });

  it("shows an error if the draft can't be loaded", async () => {
    vi.mocked(fetchReceiptDraft).mockRejectedValue(new Error("Receipt not found"));

    renderReviewPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Receipt not found");
  });

  it("shows a duplicate warning and dismisses it on 'not a duplicate'", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(findDuplicateReceipt).mockResolvedValue({
      id: "receipt-old",
      uploadedAt: "2026-08-01T10:00:00Z",
    });

    renderReviewPage();

    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /not a duplicate/i }));

    expect(screen.queryByText(/possible duplicate/i)).not.toBeInTheDocument();
  });

  it("deletes the draft and navigates home when confirmed as a duplicate", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(findDuplicateReceipt).mockResolvedValue({
      id: "receipt-old",
      uploadedAt: "2026-08-01T10:00:00Z",
    });
    vi.mocked(deleteReceipt).mockResolvedValue(undefined);

    renderReviewPage();
    await screen.findByText(/possible duplicate/i);
    await userEvent.click(screen.getByRole("button", { name: /it's a duplicate/i }));

    expect(deleteReceipt).toHaveBeenCalledWith("receipt-1");
    expect(await screen.findByText("Home stub")).toBeInTheDocument();
  });
});
