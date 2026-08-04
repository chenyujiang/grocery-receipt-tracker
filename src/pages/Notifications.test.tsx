import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// @/lib/alerts is the boundary — its own Supabase behavior is already
// covered by alerts.test.ts; this only checks the page's UI behavior.
vi.mock("@/lib/alerts", () => ({
  fetchAlerts: vi.fn(),
}));

import { fetchAlerts } from "@/lib/alerts";
import Notifications from "@/pages/Notifications";

describe("Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays each alert, including product name and change percent", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue([
      {
        id: "alert-1",
        type: "price_spike",
        productId: "product-1",
        productNameEn: "Anchor Blue Milk",
        productNameZh: "安科蓝带牛奶",
        newPrice: 5.0,
        changePercent: 25,
        createdAt: "2026-08-05T00:00:00Z",
      },
    ]);

    render(<MemoryRouter><Notifications /></MemoryRouter>);

    expect(await screen.findByText(/Anchor Blue Milk/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it("shows a message when there are no alerts", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue([]);

    render(<MemoryRouter><Notifications /></MemoryRouter>);

    expect(await screen.findByText(/no alerts|暂无提醒/i)).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchAlerts).mockRejectedValue(new Error("network error"));

    render(<MemoryRouter><Notifications /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
