import type { Language } from "@/lib/bilingual";

// Shared by MonthlyReport's own month nav and DatePickerField, so every
// year-then-month picker in the app renders month names the same way.
export function formatMonthLabel(date: Date, language: Language): string {
  return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-NZ", {
    month: "long",
    year: "numeric",
  });
}

// DatePickerField's trigger label — full year-month-day, unlike
// formatMonthLabel's month-and-year (still used by MonthlyReport's own,
// deliberately month-only, report nav).
export function formatDateLabel(date: Date, language: Language): string {
  return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-NZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getMonthNames(language: Language): string[] {
  const formatter = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-NZ", {
    month: "short",
  });
  return Array.from({ length: 12 }, (_, monthIndex) => formatter.format(new Date(2000, monthIndex, 1)));
}
