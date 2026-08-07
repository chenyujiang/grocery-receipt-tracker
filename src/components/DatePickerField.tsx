import { useState } from "react";
import { useLanguage } from "@/lib/LanguageProvider";
import { formatDateLabel, getMonthNames } from "@/lib/monthFormat";

interface DatePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  maxDate?: Date;
  clearable?: boolean;
}

// A labeled year → month → day popover field. Reuses MonthlyReport's own
// month-nav CSS classes (.month-picker-*) — this is that same popover, with
// a day grid added as a second step after a month is picked, so callers get
// full day precision instead of just a month.
export default function DatePickerField({
  label,
  value,
  onChange,
  maxDate,
  clearable = false,
}: DatePickerFieldProps) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"month" | "day">("month");
  const [pickerYear, setPickerYear] = useState(() => (value ?? maxDate ?? new Date()).getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => (value ?? maxDate ?? new Date()).getMonth());

  function openPicker() {
    const base = value ?? maxDate ?? new Date();
    setPickerYear(base.getFullYear());
    setPickerMonth(base.getMonth());
    setView("month");
    setOpen(true);
  }

  function handlePickMonth(monthIndex: number) {
    setPickerMonth(monthIndex);
    setView("day");
  }

  function handlePickDay(day: number) {
    onChange(new Date(pickerYear, pickerMonth, day));
    setOpen(false);
  }

  const maxYear = maxDate?.getFullYear();
  const monthDisabled = (monthIndex: number) =>
    maxYear !== undefined &&
    (pickerYear > maxYear || (pickerYear === maxYear && monthIndex > (maxDate as Date).getMonth()));

  const maxDateOnly =
    maxDate && new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  const dayDisabled = (day: number) =>
    maxDateOnly !== undefined && new Date(pickerYear, pickerMonth, day).getTime() > maxDateOnly.getTime();

  const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  const selectedDay =
    value !== null && value.getFullYear() === pickerYear && value.getMonth() === pickerMonth
      ? value.getDate()
      : null;

  return (
    <div className="month-picker-field">
      <span className="month-picker-field-label">{label}</span>
      <div className="month-picker">
        <button type="button" className="month-picker-trigger" onClick={openPicker}>
          {value ? formatDateLabel(value, language) : t("common.any")}
        </button>
        {clearable && value && (
          <button
            type="button"
            className="month-picker-clear"
            aria-label={t("common.clear")}
            onClick={() => onChange(null)}
          >
            ×
          </button>
        )}
        {open && (
          <>
            <div className="month-picker-backdrop" onClick={() => setOpen(false)} />
            <div className="month-picker-popover" role="dialog" aria-label={label}>
              {view === "month" ? (
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
                    <strong>{pickerYear}</strong>
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={t("report.nextYear")}
                      disabled={maxYear !== undefined && pickerYear >= maxYear}
                      onClick={() => setPickerYear((year) => year + 1)}
                    >
                      ›
                    </button>
                  </div>
                  <div className="month-picker-grid">
                    {getMonthNames(language).map((name, monthIndex) => (
                      <button
                        key={name}
                        type="button"
                        className="month-picker-month"
                        disabled={monthDisabled(monthIndex)}
                        onClick={() => handlePickMonth(monthIndex)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="month-picker-year-row">
                    <button type="button" className="btn-secondary" onClick={() => setView("month")}>
                      {t("common.back")}
                    </button>
                    <strong>
                      {getMonthNames(language)[pickerMonth]} {pickerYear}
                    </strong>
                    <span style={{ width: 1 }} />
                  </div>
                  <div className="month-picker-day-grid">
                    {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={day === selectedDay ? "month-picker-day active" : "month-picker-day"}
                        disabled={dayDisabled(day)}
                        onClick={() => handlePickDay(day)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
