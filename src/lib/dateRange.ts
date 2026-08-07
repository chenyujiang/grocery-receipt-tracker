function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Section 15, page 1 + Section 14: the calendar-month window used by both
// the Home dashboard and the monthly report, for filtering the `date`-typed
// purchase_date column.
export function monthBounds(date: Date): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

// The exclusive upper bound for filtering a timestamptz column (e.g.
// alerts.created_at) by calendar month: gte(monthBounds(d).start) and
// lt(nextMonthStart(d)) together cover the whole month regardless of the
// time-of-day component.
export function nextMonthStart(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const next = new Date(year, month + 1, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;
}

// The calendar month a date falls in, as a Date on its 1st — the unit
// MonthlyReport's own month nav selects.
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Shared with the `date`-typed purchase_date column's string form —
// DatePickerField hands back a Date, but every filter/save call needs the
// local-calendar-day string (not toISOString, which shifts by timezone).
export function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
