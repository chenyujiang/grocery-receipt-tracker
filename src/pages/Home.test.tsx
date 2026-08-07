import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// @/lib/home is the boundary — its own Supabase behavior is already
// covered by home.test.ts; this only checks the page's UI behavior.
vi.mock("@/lib/home", () => ({
  fetchHomeSummary: vi.fn(),
}));

import { fetchHomeSummary } from "@/lib/home";
import Home from "@/pages/Home";

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows this month's total, category breakdown, alert count, and recent receipts", async () => {
    vi.mocked(fetchHomeSummary).mockResolvedValue({
      monthTotal: 33.5,
      categoryBreakdown: [{ category: "Food - Fruits", total: 25.5 }],
      pendingAlertsCount: 3,
      recentReceipts: [
        {
          id: "receipt-1",
          storeNameEn: "Countdown",
          storeNameZh: "城内城外",
          purchaseDate: "2026-08-04",
          totalAmount: 25.5,
          status: "confirmed",
        },
      ],
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(await screen.findByText("$33.50")).toBeInTheDocument();
    expect(screen.getByText(/Food - Fruits/)).toBeInTheDocument();
    expect(screen.getByText(/3 pending alerts/)).toBeInTheDocument();
    expect(screen.getByText(/Countdown/)).toBeInTheDocument();
  });

  it("shows empty-state messages when there's no data yet", async () => {
    vi.mocked(fetchHomeSummary).mockResolvedValue({
      monthTotal: 0,
      categoryBreakdown: [],
      pendingAlertsCount: 0,
      recentReceipts: [],
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no receipts yet/i)).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchHomeSummary).mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
