import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// @/lib/receiptList, @/lib/circleMembers, and @/lib/receipts are the
// boundary — their own Supabase behavior is already covered by their own
// test files; this only checks the page's UI behavior (loading, filtering,
// empty/error states, delete).
vi.mock("@/lib/receiptList", () => ({
  fetchReceipts: vi.fn(),
}));
vi.mock("@/lib/circleMembers", () => ({
  fetchCircleMembers: vi.fn(),
}));
vi.mock("@/lib/receipts", () => ({
  deleteReceipt: vi.fn(),
}));
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { fetchReceipts } from "@/lib/receiptList";
import { fetchCircleMembers } from "@/lib/circleMembers";
import { deleteReceipt } from "@/lib/receipts";
import { useAuth } from "@/lib/AuthProvider";
import ReceiptList from "@/pages/ReceiptList";

describe("ReceiptList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: "user-1", accessToken: "tok" },
      loading: false,
    });
  });

  it("loads and displays receipts on mount", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-1",
      },
    ]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Countdown/)).toBeInTheDocument();
    expect(fetchReceipts).toHaveBeenCalledWith({});
  });

  it("links a confirmed receipt to its read-only detail page, and a pending one to review", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-1",
      },
      {
        id: "receipt-2",
        storeNameEn: "New World",
        storeNameZh: "新世界",
        purchaseDate: "2026-08-03",
        totalAmount: 12,
        status: "pending_review",
        uploadedBy: "user-1",
      },
    ]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    expect(await screen.findByText("Countdown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view details/i })).toHaveAttribute(
      "href",
      "/receipts/receipt-1"
    );
    expect(screen.getByRole("link", { name: /needs review/i })).toHaveAttribute(
      "href",
      "/receipts/receipt-2/review"
    );
  });

  it("re-queries with the entered filters on submit", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    await screen.findByText(/no receipts found/i);

    await userEvent.type(screen.getByLabelText("Store"), "Countdown");
    await userEvent.click(screen.getByRole("button", { name: /filter/i }));

    expect(fetchReceipts).toHaveBeenLastCalledWith({ storeQuery: "Countdown" });
  });

  it("re-queries with a month-picked date range on submit", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    await screen.findByText(/no receipts found/i);

    const [fromTrigger] = screen.getAllByRole("button", { name: "Any" });
    await userEvent.click(fromTrigger);
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));
    await userEvent.click(screen.getByRole("button", { name: /filter/i }));

    const currentYear = new Date().getFullYear();
    expect(fetchReceipts).toHaveBeenLastCalledWith({
      dateFrom: `${currentYear}-01-01`,
      dateTo: undefined,
    });
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchReceipts).mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });

  it("deletes a receipt after the user confirms", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-1",
      },
    ]);
    vi.mocked(deleteReceipt).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    await screen.findByText(/Countdown/);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(deleteReceipt).toHaveBeenCalledWith("receipt-1");
    await screen.findByText(/no receipts found/i);
  });

  it("hides the delete action for a receipt uploaded by someone else", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-2",
      },
    ]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    await screen.findByText(/Countdown/);

    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view details/i })).toBeInTheDocument();
  });

  it("keeps the receipt if the user cancels the delete", async () => {
    vi.mocked(fetchReceipts).mockResolvedValue([
      {
        id: "receipt-1",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        purchaseDate: "2026-08-04",
        totalAmount: 25.5,
        status: "confirmed",
        uploadedBy: "user-1",
      },
    ]);

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    await screen.findByText(/Countdown/);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(deleteReceipt).not.toHaveBeenCalled();
    expect(screen.getByText(/Countdown/)).toBeInTheDocument();
  });
});
