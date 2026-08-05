import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonthPickerField from "@/components/MonthPickerField";

describe("MonthPickerField", () => {
  it("shows a placeholder when unset, and picks a year-then-month value", async () => {
    const onChange = vi.fn();
    render(<MonthPickerField label="From" value={null} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Any" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));

    const currentYear = new Date().getFullYear();
    expect(onChange).toHaveBeenCalledWith(new Date(currentYear, 0, 1));
  });

  it("shows a clear button only when clearable and a value is set, and clears on click", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MonthPickerField label="From" value={new Date(2026, 5, 1)} onChange={onChange} clearable />
    );

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<MonthPickerField label="From" value={new Date(2026, 5, 1)} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("disables months after maxMonth and the next-year button at the max year", async () => {
    const onChange = vi.fn();
    const maxMonth = new Date(2026, 5, 1); // June 2026
    render(<MonthPickerField label="From" value={null} onChange={onChange} maxMonth={maxMonth} />);

    await userEvent.click(screen.getByRole("button", { name: "Any" }));

    expect(screen.getByRole("button", { name: /next year/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Jul" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Jun" })).not.toBeDisabled();
  });
});
