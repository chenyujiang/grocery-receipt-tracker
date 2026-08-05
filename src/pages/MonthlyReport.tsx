import { useEffect, useState } from "react";
import { fetchMonthlyReport, type MonthlyReport as MonthlyReportData } from "@/lib/monthlyReport";
import { fetchExportRows, rowsToCsv, downloadCsv } from "@/lib/exportCsv";
import { monthBounds } from "@/lib/dateRange";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel, type Language } from "@/lib/bilingual";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthLabel(date: Date, language: Language): string {
  return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-NZ", {
    month: "long",
    year: "numeric",
  });
}

// Section 14 + 15, page 5: month-scoped overview — total spend vs last month,
// category breakdown, the price-change leaderboard (reusing Section 10),
// alert counts, per-uploader spending, and the CSV export button.
export default function MonthlyReport() {
  const { language, t } = useLanguage();
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
      <h1>{t("report.title")}</h1>

      <div className="month-nav">
        <button type="button" className="btn-secondary" onClick={goToPreviousMonth}>
          {t("report.previous")}
        </button>
        <strong>{formatMonthLabel(month, language)}</strong>
        <button type="button" className="btn-secondary" onClick={goToNextMonth}>
          {t("report.next")}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {!error && report === null && <p>{t("common.loading")}</p>}

      {!error && report !== null && (
        <>
          <section>
            <h2>{t("report.totalSpend")}</h2>
            <p className="home-month-total">${report.totalSpend.toFixed(2)}</p>
            <p>
              {report.changePercent === null
                ? t("report.noPriorSpend")
                : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}% ${t("report.vsLastMonth")} ($${report.previousMonthSpend.toFixed(2)})`}
            </p>
          </section>

          <section>
            <h2>{t("report.byCategory")}</h2>
            {report.categoryBreakdown.length === 0 ? (
              <p>{t("home.noData")}</p>
            ) : (
              <ul>
                {report.categoryBreakdown.map((entry) => (
                  <li key={entry.category}>
                    {categoryLabel(entry.category, language)} — ${entry.total.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>{t("report.leaderboard")}</h2>
            {report.priceChangeLeaderboard.length === 0 ? (
              <p>{t("report.noIncreases")}</p>
            ) : (
              <ul>
                {report.priceChangeLeaderboard.map((entry) => (
                  <li key={entry.productId}>
                    {pickText(entry.nameEn, entry.nameZh, language)} — +{entry.changePercent}%
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>{t("home.alerts")}</h2>
            <p>
              {report.alertCount} {t("report.alertsTriggered")}
            </p>
          </section>

          <section>
            <h2>{t("report.byUploader")}</h2>
            {report.spendByUploader.length === 0 ? (
              <p>{t("home.noData")}</p>
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
              {report.receiptCount} {t("report.receipts")} · {report.lineItemCount} {t("report.lineItems")}
            </p>
          </section>

          <section>
            <h2>{t("report.exportCsv")}</h2>
            <label>
              {t("receiptList.from")}
              <input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
            </label>
            <label>
              {t("receiptList.to")}
              <input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
            </label>
            {exportError && <p role="alert">{exportError}</p>}
            <button type="button" onClick={handleExport} disabled={exporting}>
              {exporting ? t("report.exporting") : t("report.exportCsv")}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
