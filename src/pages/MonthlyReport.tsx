import { useEffect, useState } from "react";
import { fetchMonthlyReport, type MonthlyReport as MonthlyReportData } from "@/lib/monthlyReport";
import { fetchExportRows, rowsToCsv, downloadCsv } from "@/lib/exportCsv";
import { monthBounds, startOfMonth, formatDateString, parseDateString } from "@/lib/dateRange";
import { formatMonthLabel, getMonthNames } from "@/lib/monthFormat";
import DatePickerField from "@/components/DatePickerField";
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

  const [exportFrom, setExportFrom] = useState<Date | null>(null);
  const [exportTo, setExportTo] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerView, setPickerView] = useState<"year" | "month">("month");
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [yearGridStart, setYearGridStart] = useState(() => new Date().getFullYear() - 5);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReport(null);
    setError(null);
    setExpandedCategories(new Set());
    fetchMonthlyReport(month)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"));

    const bounds = monthBounds(month);
    setExportFrom(parseDateString(bounds.start));
    setExportTo(parseDateString(bounds.end));
  }, [month]);

  const currentMonth = startOfMonth(new Date());
  const today = new Date();
  const isCurrentMonth = month.getTime() === currentMonth.getTime();

  function goToCurrentMonth() {
    setMonth(currentMonth);
  }

  function openPicker() {
    setPickerYear(month.getFullYear());
    setPickerView("month");
    setPickerOpen(true);
  }

  function openYearGrid() {
    setYearGridStart(pickerYear - 5);
    setPickerView("year");
  }

  function handlePickYear(year: number) {
    setPickerYear(year);
    setPickerView("month");
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
    if (!exportFrom || !exportTo) return;
    setExportError(null);
    setExporting(true);
    try {
      const from = formatDateString(exportFrom);
      const to = formatDateString(exportTo);
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
        <strong>{formatMonthLabel(month, language)}</strong>
        <div className="month-nav-right">
          {!isCurrentMonth && (
            <button type="button" className="btn-secondary" onClick={goToCurrentMonth}>
              {t("report.backToToday")}
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
                  {pickerView === "year" ? (
                    <>
                      <div className="month-picker-year-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={t("report.previousYear")}
                          onClick={() => setYearGridStart((start) => start - 12)}
                        >
                          ‹
                        </button>
                        <strong>
                          {yearGridStart}–{yearGridStart + 11}
                        </strong>
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={t("report.nextYear")}
                          disabled={yearGridStart + 12 > currentMonth.getFullYear()}
                          onClick={() => setYearGridStart((start) => start + 12)}
                        >
                          ›
                        </button>
                      </div>
                      <div className="month-picker-grid">
                        {Array.from({ length: 12 }, (_, index) => yearGridStart + index).map((year) => (
                          <button
                            key={year}
                            type="button"
                            className={year === pickerYear ? "month-picker-month active" : "month-picker-month"}
                            disabled={year > currentMonth.getFullYear()}
                            onClick={() => handlePickYear(year)}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="month-picker-year-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={t("report.previousYear")}
                          onClick={() => setPickerYear((year) => year - 1)}
                        >
                          ‹
                        </button>
                        <button type="button" className="btn-secondary" onClick={openYearGrid}>
                          {pickerYear}
                        </button>
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
                    </>
                  )}
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
                    <li key={entry.category} style={{ marginBottom: 8, borderBottom: "none" }}>
                      <button
                        type="button"
                        className={isOpen ? undefined : "btn-secondary"}
                        style={{
                          width: "100%",
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
                        <fieldset style={{ marginTop: 6 }}>
                          <ul>
                            {entry.products.map((product) => (
                              <li
                                key={product.productId ?? product.nameEn}
                                className="home-list-row"
                              >
                                <span>{pickText(product.nameEn, product.nameZh, language)}</span>
                                <span>${product.total.toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                        </fieldset>
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
              <DatePickerField
                label={t("receiptList.from")}
                value={exportFrom}
                onChange={setExportFrom}
                maxDate={today}
              />
              <DatePickerField
                label={t("receiptList.to")}
                value={exportTo}
                onChange={setExportTo}
                maxDate={today}
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
