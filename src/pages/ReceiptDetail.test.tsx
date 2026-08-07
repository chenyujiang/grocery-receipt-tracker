import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts is the boundary — its own Supabase behavior is already
// covered by receipts.test.ts; this only checks the page's rendering and
// its issue-16 edit-mode behavior (uploader-only, per-field inputs, the
// weighed-item unit dropdown).
vi.mock("@/lib/receipts", () => ({
  fetchReceiptDraft: vi.fn(),
  editConfirmedReceipt: vi.fn(),
}));
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { fetchReceiptDraft, editConfirmedReceipt } from "@/lib/receipts";
import { useAuth } from "@/lib/AuthProvider";
import ReceiptDetail from "@/pages/ReceiptDetail";

const WEIGHED_ITEM = {
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
};

const COUNT_ITEM = {
  id: "item-2",
  rawNameEn: "Eggs 6pk",
  rawNameZh: "鸡蛋 6只装",
  quantity: 2,
  unitSpecValue: null,
  unitSpecUnit: null,
  unitPrice: 3.0,
  originalPrice: null,
  isPromotion: false,
  subtotal: 6.0,
  productId: "product-2",
  category: "Food - Dairy & Bakery",
};

const SAMPLE_DRAFT = {
  id: "receipt-1",
  uploadedBy: "user-1",
  storeNameEn: "Countdown Newmarket",
  storeNameZh: "倒数超市 Newmarket 店",
  purchaseDate: "2026-06-05",
  totalAmount: 10.5,
  status: "confirmed",
  originalImageUrl: null,
  items: [WEIGHED_ITEM, COUNT_ITEM],
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

function mockSession(userId: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    session: userId ? { userId, accessToken: "tok" } : null,
    loading: false,
  } as never);
}

describe("ReceiptDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  it("loads and displays a confirmed receipt's line items, read-only by default", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderDetailPage();

    expect(await screen.findByText("Countdown Newmarket")).toBeInTheDocument();
    expect(screen.getByText("Anchor Blue Milk 2L")).toBeInTheDocument();
    // WEIGHED_ITEM has a weight/volume spec (2L) — it should show alongside quantity/price.
    expect(screen.getByText(/\(2L\)/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows an Edit button only to the receipt's own uploader", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    mockSession("someone-else");

    renderDetailPage();
    await screen.findByText("Countdown Newmarket");

    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("switches to editable inputs, pre-filled with current values, when Edit is clicked", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderDetailPage();
    await screen.findByText("Countdown Newmarket");
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByDisplayValue("Anchor Blue Milk 2L")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4.5")).toBeInTheDocument();
  });

  it("shows the weight/volume spec editor only for an item that already has a unit", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderDetailPage();
    await screen.findByText("Countdown Newmarket");
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    // WEIGHED_ITEM has unitSpecUnit "L" -> gets a unit dropdown.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("saves the edited fields and the corrected month, then returns to read-only view", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(editConfirmedReceipt).mockResolvedValue(undefined);

    renderDetailPage();
    await screen.findByText("Countdown Newmarket");
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const nameInput = screen.getByDisplayValue("Anchor Blue Milk 2L");
    fireEvent.change(nameInput, { target: { value: "Anchor Milk 2L" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(editConfirmedReceipt).toHaveBeenCalledWith(
      "receipt-1",
      "2026-06-05",
      expect.arrayContaining([expect.objectContaining({ id: "item-1", rawNameEn: "Anchor Milk 2L" })])
    );
  });

  it("discards changes without saving when Cancel is clicked", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderDetailPage();
    await screen.findByText("Countdown Newmarket");
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue("Anchor Blue Milk 2L"), {
      target: { value: "something else" },
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(editConfirmedReceipt).not.toHaveBeenCalled();
    expect(screen.getByText("Anchor Blue Milk 2L")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchReceiptDraft).mockRejectedValue(new Error("network error"));

    renderDetailPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
