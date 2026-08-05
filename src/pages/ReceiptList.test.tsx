import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// @/lib/receiptList and @/lib/circleMembers are the boundary — their own
// Supabase behavior is already covered by their own test files; this only
// checks the page's UI behavior (loading, filtering, empty/error states).
vi.mock("@/lib/receiptList", () => ({
  fetchReceipts: vi.fn(),
}));
vi.mock("@/lib/circleMembers", () => ({
  fetchCircleMembers: vi.fn(),
}));

import { fetchReceipts } from "@/lib/receiptList";
import { fetchCircleMembers } from "@/lib/circleMembers";
import ReceiptList from "@/pages/ReceiptList";

describe("ReceiptList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCircleMembers).mockResolvedValue([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
    ]);
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

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchReceipts).mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <ReceiptList />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
