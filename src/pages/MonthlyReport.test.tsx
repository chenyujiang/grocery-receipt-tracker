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
  categoryBreakdown: [
    {
      category: "Food - Fresh Produce",
      total: 60,
      products: [
        { productId: "product-2", nameEn: "Broccoli", nameZh: "西兰花", total: 40 },
        { productId: "product-3", nameEn: "Carrots", nameZh: "胡萝卜", total: 20 },
      ],
    },
  ],
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

  it("expands a category to reveal its product breakdown, and collapses again", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    expect(screen.queryByText(/Broccoli/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Food - Fresh Produce/ }));

    expect(screen.getByText(/Broccoli/)).toBeInTheDocument();
    expect(screen.getByText(/Carrots/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Food - Fresh Produce/ }));

    expect(screen.queryByText(/Broccoli/)).not.toBeInTheDocument();
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

  it("hides Next on the current month, and shows it again after going back", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    expect(screen.queryByRole("button", { name: /^next/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /previous/i }));

    expect(screen.getByRole("button", { name: /^next/i })).toBeInTheDocument();
  });

  it("opens a year-then-month picker and re-queries the picked month", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    await userEvent.click(screen.getByRole("button", { name: /pick a month/i }));
    await userEvent.click(screen.getByRole("button", { name: /previous year/i }));

    const expectedYear = new Date().getFullYear() - 1;
    expect(screen.getByText(String(expectedYear))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Jan" }));

    expect(fetchMonthlyReport).toHaveBeenLastCalledWith(new Date(expectedYear, 0, 1));
  });

  it("disables months after the current month and the next-year button", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    await userEvent.click(screen.getByRole("button", { name: /pick a month/i }));

    expect(screen.getByRole("button", { name: /next year/i })).toBeDisabled();

    const now = new Date();
    if (now.getMonth() < 11) {
      expect(screen.getByRole("button", { name: "Dec" })).toBeDisabled();
    }
  });

  it("closes the picker without changing the month when the backdrop is clicked", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");
    const callsBeforeOpening = vi.mocked(fetchMonthlyReport).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: /pick a month/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // eslint-disable-next-line testing-library/no-node-access
    await userEvent.click(document.querySelector(".month-picker-backdrop") as HTMLElement);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMonthlyReport).toHaveBeenCalledTimes(callsBeforeOpening);
  });

  // The export-CSV section is temporarily hidden (SHOW_EXPORT_CSV = false in
  // MonthlyReport.tsx) — skipped rather than deleted so re-enabling the flag
  // brings this coverage straight back.
  it.skip("exports a CSV for the selected date range", async () => {
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

  it.skip("exports from a year-month-day-picked range when the export From date is changed", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);
    vi.mocked(fetchExportRows).mockResolvedValue([]);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    const now = new Date();
    const defaultFromLabel = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-NZ", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const exportFromTrigger = screen.getByRole("button", { name: defaultFromLabel });
    await userEvent.click(exportFromTrigger);
    await userEvent.click(screen.getByRole("button", { name: /previous year/i }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));
    await userEvent.click(screen.getByRole("button", { name: "1" }));

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    const expectedYear = new Date().getFullYear() - 1;
    await vi.waitFor(() =>
      expect(downloadCsv).toHaveBeenCalledWith(
        expect.stringContaining(`receipts_${expectedYear}-01-01_to_`),
        "csv-content"
      )
    );
  });
});
