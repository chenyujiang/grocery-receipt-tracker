import { useEffect, useState } from "react";
import { fetchMonthlyReport, type MonthlyReport as MonthlyReportData } from "@/lib/monthlyReport";
import { fetchExportRows, rowsToCsv, downloadCsv } from "@/lib/exportCsv";
import { monthBounds, startOfMonth } from "@/lib/dateRange";
import { formatMonthLabel, getMonthNames } from "@/lib/monthFormat";
import MonthPickerField from "@/components/MonthPickerField";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";

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

// Temporarily hidden per product decision — code and tests kept intact so
// it's a one-line flip to bring back.
const SHOW_EXPORT_CSV = false;

// Section 14 + 15, page 5: month-scoped overview — total spend vs last month,
// category breakdown, the price-change leaderboard (reusing Section 10),
// alert counts, per-uploader spending, and the CSV export button.
export default function MonthlyReport() {
  const { language, t } = useLanguage();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [report, setReport] = useState<MonthlyReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [exportFromMonth, setExportFromMonth] = useState<Date | null>(null);
  const [exportToMonth, setExportToMonth] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReport(null);
    setError(null);
    setExpandedCategories(new Set());
    fetchMonthlyReport(month)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"));

    setExportFromMonth(month);
    setExportToMonth(month);
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

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function handleExport() {
    if (!exportFromMonth || !exportToMonth) return;
    setExportError(null);
    setExporting(true);
    try {
      const from = monthBounds(exportFromMonth).start;
      const to = monthBounds(exportToMonth).end;
      const rows = await fetchExportRows({ from, to });
      downloadCsv(`receipts_${from}_to_${to}.csv`, rowsToCsv(rows));
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
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {report.categoryBreakdown.map((entry) => {
                  const isOpen = expandedCategories.has(entry.category);
                  return (
                    <li key={entry.category} style={{ marginBottom: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-block"
                        style={{
                          marginTop: 0,
                          display: "flex",
                          justifyContent: "space-between",
                          textAlign: "left",
                        }}
                        onClick={() => toggleCategory(entry.category)}
                      >
                        <span>
                          {isOpen ? "▾" : "▸"} {categoryLabel(entry.category, language)}
                        </span>
                        <span>${entry.total.toFixed(2)}</span>
                      </button>
                      {isOpen && (
                        <ul style={{ marginTop: 6, paddingLeft: 24 }}>
                          {entry.products.map((product) => (
                            <li key={product.productId ?? product.nameEn}>
                              {pickText(product.nameEn, product.nameZh, language)} — $
                              {product.total.toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
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

          {SHOW_EXPORT_CSV && (
            <section>
              <h2>{t("report.exportCsv")}</h2>
              <MonthPickerField
                label={t("receiptList.from")}
                value={exportFromMonth}
                onChange={setExportFromMonth}
                maxMonth={currentMonth}
              />
              <MonthPickerField
                label={t("receiptList.to")}
                value={exportToMonth}
                onChange={setExportToMonth}
                maxMonth={currentMonth}
              />
              {exportError && <p role="alert">{exportError}</p>}
              <button type="button" className="btn-block" onClick={handleExport} disabled={exporting}>
                {exporting ? t("report.exporting") : t("report.exportCsv")}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
