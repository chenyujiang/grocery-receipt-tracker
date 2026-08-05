import { useState } from "react";
import { useLanguage } from "@/lib/LanguageProvider";
import { formatMonthLabel, getMonthNames } from "@/lib/monthFormat";

interface MonthPickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (month: Date | null) => void;
  maxMonth?: Date;
  clearable?: boolean;
}

// The same year-then-month popover as MonthlyReport's own month nav, but as
// a labeled form field with an optional "unset" state — used everywhere else
// in the app a date used to be picked with the native <input type="date">
// (ReceiptList's filters, MonthlyReport's CSV export range), for a
// consistent picker interaction throughout.
export default function MonthPickerField({
  label,
  value,
  onChange,
  maxMonth,
  clearable = false,
}: MonthPickerFieldProps) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => (value ?? maxMonth ?? new Date()).getFullYear());

  function openPicker() {
    setPickerYear((value ?? maxMonth ?? new Date()).getFullYear());
    setOpen(true);
  }

  function handlePick(monthIndex: number) {
    onChange(new Date(pickerYear, monthIndex, 1));
    setOpen(false);
  }

  const maxYear = maxMonth?.getFullYear();

  return (
    <div className="month-picker-field">
      <span className="month-picker-field-label">{label}</span>
      <div className="month-picker">
        <button type="button" className="month-picker-trigger" onClick={openPicker}>
          {value ? formatMonthLabel(value, language) : t("common.any")}
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
                {getMonthNames(language).map((name, monthIndex) => {
                  const disabled =
                    maxYear !== undefined &&
                    (pickerYear > maxYear || (pickerYear === maxYear && monthIndex > (maxMonth as Date).getMonth()));
                  const selected =
                    value !== null && pickerYear === value.getFullYear() && monthIndex === value.getMonth();
                  return (
                    <button
                      key={name}
                      type="button"
                      className={selected ? "month-picker-month active" : "month-picker-month"}
                      disabled={disabled}
                      onClick={() => handlePick(monthIndex)}
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
  );
}
