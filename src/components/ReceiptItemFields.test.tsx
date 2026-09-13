import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceiptItemFields from "@/components/ReceiptItemFields";
import type { DraftItem } from "@/lib/receipts";

// Issue 17: the one editor both the pre-confirm review and the post-confirm
// edit mode render. Controlled — it holds no state of its own, so every
// assertion here is "the right control, wired to the right field".

const MEASURED_ITEM: DraftItem = {
  id: "item-1",
  rawNameEn: "Loose Bananas",
  rawNameZh: "散装香蕉",
  quantity: 1,
  unitSpecValue: 500,
  unitSpecUnit: "g",
  unitPrice: 3.5,
  originalPrice: null,
  isPromotion: false,
  subtotal: 3.5,
  productId: "product-1",
  category: "Food - Fruit & Vegetables",
};

const COUNTED_ITEM: DraftItem = {
  ...MEASURED_ITEM,
  id: "item-2",
  rawNameEn: "Weet-Bix 1kg",
  rawNameZh: "全麦早餐饼 1公斤",
  unitSpecValue: null,
  unitSpecUnit: null,
};

// The component is controlled and holds no state, so a bare spy would leave
// the inputs frozen at their initial values and typing would append to a
// stale string. This harness closes the loop the way the pages do, and still
// reports every call.
function renderControlled(item: DraftItem) {
  const onChange = vi.fn();

  function Harness() {
    const [current, setCurrent] = useState(item);
    return (
      <ReceiptItemFields
        item={current}
        onChange={(field, value) => {
          onChange(field, value);
          setCurrent((previous) => ({ ...previous, [field]: value }));
        }}
      />
    );
  }

  render(<Harness />);
  return onChange;
}

describe("ReceiptItemFields", () => {
  it("pre-fills every editable field from the item", async () => {
    render(<ReceiptItemFields item={MEASURED_ITEM} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("Loose Bananas")).toBeInTheDocument();
    expect(screen.getByDisplayValue("散装香蕉")).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(1);
    expect(screen.getByLabelText(/unit price/i)).toHaveValue(3.5);
    expect(screen.getByLabelText(/promotion/i)).not.toBeChecked();
  });

  it("reports each edited field through onChange with its own type", async () => {
    const onChange = renderControlled(MEASURED_ITEM);

    await userEvent.type(screen.getByLabelText(/name \(en\)/i), "!");
    expect(onChange).toHaveBeenLastCalledWith("rawNameEn", "Loose Bananas!");

    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), "3");
    expect(onChange).toHaveBeenLastCalledWith("quantity", 3);

    await userEvent.click(screen.getByLabelText(/promotion/i));
    expect(onChange).toHaveBeenLastCalledWith("isPromotion", true);
  });

  // Issue 16's rule, now applying to both flows (issue 17): only an item that
  // already has a unit is a weighed/measured one. Nothing gains a spec here.
  it("shows the weight/volume spec editor only for an item that already has a unit", () => {
    const { rerender } = render(<ReceiptItemFields item={MEASURED_ITEM} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/spec value/i)).toHaveValue(500);
    expect(screen.getByLabelText(/spec unit/i)).toHaveValue("g");

    rerender(<ReceiptItemFields item={COUNTED_ITEM} onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/spec value/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/spec unit/i)).not.toBeInTheDocument();
  });

  // The unit is a fixed list, not free text: src/lib/units.ts only normalizes
  // these four, and anything else silently falls through to an "each" basis.
  it("offers exactly the four units the unit-normalization logic recognizes", async () => {
    const onChange = renderControlled(MEASURED_ITEM);

    const unitSelect = screen.getByLabelText(/spec unit/i);
    expect(Array.from(unitSelect.querySelectorAll("option")).map((o) => o.value)).toEqual([
      "g",
      "kg",
      "ml",
      "L",
    ]);

    await userEvent.selectOptions(unitSelect, "kg");
    expect(onChange).toHaveBeenLastCalledWith("unitSpecUnit", "kg");
  });

  // Issue 17, decision 3: category isn't a ReceiptItem field (spec.md 5.2), so
  // it has no place in the ReceiptItem editor — the pages render it instead.
  it("never renders the category, even read-only", () => {
    render(<ReceiptItemFields item={MEASURED_ITEM} onChange={vi.fn()} />);

    expect(screen.queryByText(/fruit & vegetables/i)).not.toBeInTheDocument();
  });
});
