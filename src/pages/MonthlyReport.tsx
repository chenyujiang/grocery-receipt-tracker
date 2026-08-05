import { useEffect, useState } from "react";
import { fetchMonthlyReport, type MonthlyReport as MonthlyReportData } from "@/lib/monthlyReport";
import { fetchExportRows, rowsToCsv, downloadCsv } from "@/lib/exportCsv";
import { monthBounds } from "@/lib/dateRange";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
}

// Section 14 + 15, page 5: month-scoped overview — total spend vs last month,
// category breakdown, the price-change leaderboard (reusing Section 10),
// alert counts, per-uploader spending, and the CSV export button.
export default function MonthlyReport() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [report, setReport] = useState<MonthlyReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    fetchMonthlyReport(month)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"));

    const bounds = monthBounds(month);
    setExportFrom(bounds.start);
    setExportTo(bounds.end);
  }, [month]);

  function goToPreviousMonth() {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const rows = await fetchExportRows({ from: exportFrom, to: exportTo });
      downloadCsv(`receipts_${exportFrom}_to_${exportTo}.csv`, rowsToCsv(rows));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <h1>Monthly Report</h1>

      <div className="month-nav">
        <button type="button" className="btn-secondary" onClick={goToPreviousMonth}>
          ‹ Previous
        </button>
        <strong>{formatMonthLabel(month)}</strong>
        <button type="button" className="btn-secondary" onClick={goToNextMonth}>
          Next ›
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {!error && report === null && <p>Loading…</p>}

      {!error && report !== null && (
        <>
          <section>
            <h2>Total spend</h2>
            <p className="home-month-total">${report.totalSpend.toFixed(2)}</p>
            <p>
              {report.changePercent === null
                ? "No spend last month to compare against."
                : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}% vs. last month ($${report.previousMonthSpend.toFixed(2)})`}
            </p>
          </section>

          <section>
            <h2>By category</h2>
            {report.categoryBreakdown.length === 0 ? (
              <p>No data yet.</p>
            ) : (
              <ul>
                {report.categoryBreakdown.map((entry) => (
                  <li key={entry.category}>
                    {entry.category} — ${entry.total.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Biggest price increases</h2>
            {report.priceChangeLeaderboard.length === 0 ? (
              <p>No price increases this month.</p>
            ) : (
              <ul>
                {report.priceChangeLeaderboard.map((entry) => (
                  <li key={entry.productId}>
                    {entry.nameZh} {entry.nameEn} — +{entry.changePercent}%
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Alerts</h2>
            <p>{report.alertCount} alerts triggered this month</p>
          </section>

          <section>
            <h2>By uploader</h2>
            {report.spendByUploader.length === 0 ? (
              <p>No data yet.</p>
            ) : (
              <ul>
                {report.spendByUploader.map((entry) => (
                  <li key={entry.userId}>
                    {entry.displayName} — ${entry.total.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
            <p>
              {report.receiptCount} receipts · {report.lineItemCount} line items
            </p>
          </section>

          <section>
            <h2>Export CSV</h2>
            <label>
              From
              <input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
            </label>
            {exportError && <p role="alert">{exportError}</p>}
            <button type="button" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
