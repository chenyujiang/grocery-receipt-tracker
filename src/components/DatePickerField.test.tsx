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
