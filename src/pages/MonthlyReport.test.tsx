import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
      category: "Food - Fruits",
      total: 60,
      products: [
        { productId: "product-2", nameEn: "Broccoli", nameZh: "西兰花", total: 40, promoSavings: 0 },
        { productId: "product-3", nameEn: "Carrots", nameZh: "胡萝卜", total: 20, promoSavings: 1.5 },
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
    expect(screen.getByText(/Food - Fruits/)).toBeInTheDocument();
    expect(screen.getByText(/Anchor Blue Milk/)).toBeInTheDocument();
    expect(screen.getByText(/3 alerts triggered/)).toBeInTheDocument();
  });

  it("expands a category to reveal its product breakdown, and collapses again", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    expect(screen.queryByText(/Broccoli/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Food - Fruits/ }));

    expect(screen.getByText(/Broccoli/)).toBeInTheDocument();
    expect(screen.getByText(/Carrots/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Food - Fruits/ }));

    expect(screen.queryByText(/Broccoli/)).not.toBeInTheDocument();
  });

  it("shows a savings badge only for a product with promotional savings this month", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    await userEvent.click(screen.getByRole("button", { name: /Food - Fruits/ }));

    const carrotsRow = screen.getByText("Carrots").closest("li") as HTMLElement;
    expect(within(carrotsRow).getByText(/Saved \$1\.50/)).toBeInTheDocument();

    const broccoliRow = screen.getByText("Broccoli").closest("li") as HTMLElement;
    expect(within(broccoliRow).queryByText(/Saved/)).not.toBeInTheDocument();
  });

  it("shows a Today button only when viewing a past month, and it jumps back to the current month", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /pick a month/i }));
    await userEvent.click(screen.getByRole("button", { name: /previous year/i }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));

    expect(await screen.findByRole("button", { name: "Today" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
    const now = new Date();
    expect(fetchMonthlyReport).toHaveBeenLastCalledWith(new Date(now.getFullYear(), now.getMonth(), 1));
  });

  it("opens a year grid for a fast jump to a distant year, then picks its month", async () => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(SAMPLE_REPORT);

    render(<MonthlyReport />);
    await screen.findByText("$120.50");

    const currentYear = new Date().getFullYear();
    await userEvent.click(screen.getByRole("button", { name: /pick a month/i }));
    await userEvent.click(screen.getByRole("button", { name: String(currentYear) }));

    expect(screen.getByText(`${currentYear - 5}–${currentYear + 6}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: String(currentYear - 3) }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));

    expect(fetchMonthlyReport).toHaveBeenLastCalledWith(new Date(currentYear - 3, 0, 1));
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
