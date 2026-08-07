import { describe, it, expect } from "vitest";
import {
  monthBounds,
  nextMonthStart,
  startOfMonth,
  formatDateString,
  parseDateString,
} from "@/lib/dateRange";

describe("monthBounds", () => {
  it("returns the first and last calendar day of the given date's month", () => {
    expect(monthBounds(new Date("2026-08-05"))).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("handles a leap-year February", () => {
    expect(monthBounds(new Date("2028-02-10"))).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("nextMonthStart", () => {
  it("returns the first day of the following month", () => {
    expect(nextMonthStart(new Date("2026-08-05"))).toBe("2026-09-01");
  });

  it("rolls over into the next year at December", () => {
    expect(nextMonthStart(new Date("2026-12-15"))).toBe("2027-01-01");
  });
});

describe("startOfMonth", () => {
  it("returns the 1st of the given date's month", () => {
    expect(startOfMonth(new Date(2026, 7, 15))).toEqual(new Date(2026, 7, 1));
  });
});

describe("formatDateString", () => {
  it("formats a Date as a local YYYY-MM-DD string, zero-padded", () => {
    expect(formatDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseDateString", () => {
  it("parses a YYYY-MM-DD string as a local Date", () => {
    expect(parseDateString("2026-01-05")).toEqual(new Date(2026, 0, 5));
  });

  it("round-trips with formatDateString", () => {
    const date = new Date(2026, 11, 31);
    expect(parseDateString(formatDateString(date))).toEqual(date);
  });
});
