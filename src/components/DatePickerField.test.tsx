import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatePickerField from "@/components/DatePickerField";

describe("DatePickerField", () => {
  it("shows a placeholder when unset, and picks a year-then-month-then-day value", async () => {
    const onChange = vi.fn();
    render(<DatePickerField label="From" value={null} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Any" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));
    await userEvent.click(screen.getByRole("button", { name: "15" }));

    const currentYear = new Date().getFullYear();
    expect(onChange).toHaveBeenCalledWith(new Date(currentYear, 0, 15));
  });

  it("goes back to the month grid from the day grid without picking a day", async () => {
    const onChange = vi.fn();
    render(<DatePickerField label="From" value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));
    expect(screen.getByRole("button", { name: "15" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("button", { name: "Jan" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a clear button only when clearable and a value is set, and clears on click", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DatePickerField label="From" value={new Date(2026, 5, 10)} onChange={onChange} clearable />
    );

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<DatePickerField label="From" value={new Date(2026, 5, 10)} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("disables months after maxDate's month and the next-year button at the max year", async () => {
    const onChange = vi.fn();
    const maxDate = new Date(2026, 5, 10); // 10 June 2026
    render(<DatePickerField label="From" value={null} onChange={onChange} maxDate={maxDate} />);

    await userEvent.click(screen.getByRole("button", { name: "Any" }));

    expect(screen.getByRole("button", { name: /next year/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Jul" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Jun" })).not.toBeDisabled();
  });

  it("opens a year grid for a fast jump to a distant year, then picks its month and day", async () => {
    const onChange = vi.fn();
    render(<DatePickerField label="From" value={null} onChange={onChange} />);

    const currentYear = new Date().getFullYear();
    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: String(currentYear) }));

    expect(screen.getByText(`${currentYear - 5}–${currentYear + 6}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: String(currentYear - 3) }));
    await userEvent.click(screen.getByRole("button", { name: "Jan" }));
    await userEvent.click(screen.getByRole("button", { name: "10" }));

    expect(onChange).toHaveBeenCalledWith(new Date(currentYear - 3, 0, 10));
  });

  it("disables years after maxDate's year in the year grid", async () => {
    const onChange = vi.fn();
    const maxDate = new Date(2026, 5, 10); // 10 June 2026
    render(<DatePickerField label="From" value={null} onChange={onChange} maxDate={maxDate} />);

    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "2026" }));

    expect(screen.getByRole("button", { name: "2026" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "2027" })).toBeDisabled();
  });

  it("disables days after maxDate within maxDate's own month", async () => {
    const onChange = vi.fn();
    const maxDate = new Date(2026, 5, 10); // 10 June 2026
    render(<DatePickerField label="From" value={null} onChange={onChange} maxDate={maxDate} />);

    await userEvent.click(screen.getByRole("button", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "Jun" }));

    expect(screen.getByRole("button", { name: "10" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "11" })).toBeDisabled();
  });
});
