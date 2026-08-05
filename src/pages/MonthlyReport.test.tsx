import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// @/lib/monthlyReport and @/lib/exportCsv are the boundary — their own
// Supabase behavior and math are already covered by their own test files;
// this only checks the page's UI behavior (loading, month navigation, export).
vi.mock("@/lib/monthlyReport", () => ({
  fetchMonthlyReport: vi.fn(),
}));
vi.mock("@/lib/exportCsv", () => ({
  fetchExportRows: vi.fn(),
  rowsToCsv: vi.fn(() => "csv-content"),
  downloadCsv: vi.fn(),
}));

import { fetchMonthlyReport } from "@/lib/monthlyReport";
import { fetchExportRows, downloadCsv } from "@/lib/exportCsv";
import MonthlyReport from "@/pages/MonthlyReport";

const SAMPLE_REPORT = {
  totalSpend: 120.5,
  previousMonthSpend: 100,
  changePercent: 20.5,
  categoryBreakdown: [{ category: "Food - Fresh Produce", total: 60 }],
  priceChangeLeaderboard: [
    { productId: "product-1", nameEn: "Anchor Blue Milk", nameZh: "安科蓝带牛奶", changePercent: 25 },
  ],
  alertCount: 3,
  spendByUploader: [{ userId: "user-1", displayName: "eason", total: 120.5 }],
  receiptCount: 4,
  lineItemCount: 15,
};

describe("MonthlyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the current month's report on mount", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);

    expect(await screen.findByText("$120.50")).toBeInTheDocument();
    expect(screen.getByText(/Food - Fresh Produce/)).toBeInTheDocument();
    expect(screen.getByText(/Anchor Blue Milk/)).toBeInTheDocument();
    expect(screen.getByText(/3 alerts triggered/)).toBeInTheDocument();
  });

  it("re-queries the previous month when Previous is clicked", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    const firstCallMonth = vi.mocked(fetchMonthlyReport).mock.calls[0][0] as Date;
    await userEvent.click(screen.getByRole("button", { name: /previous/i }));

    expect(fetchMonthlyReport).toHaveBeenCalledTimes(2);
    const secondCallMonth = vi.mocked(fetchMonthlyReport).mock.calls[1][0] as Date;
    expect(secondCallMonth.getMonth()).toBe(
      (firstCallMonth.getMonth() - 1 + 12) % 12
    );
  });

  it("exports a CSV for the selected date range", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);
    vi.mocked(fetchExportRows).mockResolvedValue([]);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(fetchExportRows).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(downloadCsv).toHaveBeenCalledWith(expect.stringContaining(".csv"), "csv-content")
    );
  });
});
