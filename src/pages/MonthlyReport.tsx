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

// Short month names in the current language, for the year-then-month picker.
function getMonthNames(language: Language): string[] {
  const formatter = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-NZ", {
    month: "short",
  });
  return Array.from({ length: 12 }, (_, monthIndex) => formatter.format(new Date(2000, monthIndex, 1)));
}

function CalendarIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 4v4M16 4v4" />
    </svg>
  );
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

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

  const currentMonth = startOfMonth(new Date());
  const isCurrentMonth = month.getTime() === currentMonth.getTime();

  function goToPreviousMonth() {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  function openPicker() {
    setPickerYear(month.getFullYear());
    setPickerOpen(true);
  }

  function handlePickMonth(monthIndex: number) {
    setMonth(new Date(pickerYear, monthIndex, 1));
    setPickerOpen(false);
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
        <div className="month-nav-right">
          {!isCurrentMonth && (
            <button type="button" className="btn-secondary" onClick={goToNextMonth}>
              {t("report.next")}
            </button>
          )}
          <div className="month-picker">
            <button
              type="button"
              className="month-picker-icon"
              aria-label={t("report.pickMonth")}
              onClick={openPicker}
            >
              <CalendarIcon />
            </button>
            {pickerOpen && (
              <>
                <div className="month-picker-backdrop" onClick={() => setPickerOpen(false)} />
                <div className="month-picker-popover" role="dialog" aria-label={t("report.pickMonth")}>
                  <div className="month-picker-year-row">
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={t("report.previousYear")}
                      onClick={() => setPickerYear((year) => year - 1)}
                    >
                      ‹
                    </button>
                    <strong>{pickerYear}</strong>
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={t("report.nextYear")}
                      disabled={pickerYear >= currentMonth.getFullYear()}
                      onClick={() => setPickerYear((year) => year + 1)}
                    >
                      ›
                    </button>
                  </div>
                  <div className="month-picker-grid">
                    {getMonthNames(language).map((name, monthIndex) => {
                      const disabled =
                        pickerYear === currentMonth.getFullYear() && monthIndex > currentMonth.getMonth();
                      const selected =
                        pickerYear === month.getFullYear() && monthIndex === month.getMonth();
                      return (
                        <button
                          key={name}
                          type="button"
                          className={
                            selected ? "month-picker-month active" : "month-picker-month"
                          }
                          disabled={disabled}
                          onClick={() => handlePickMonth(monthIndex)}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
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
