import { describe, it, expect } from "vitest";
import { pickText, categoryLabel } from "@/lib/bilingual";

describe("pickText", () => {
  it("returns the Chinese text when the language is zh", () => {
    expect(pickText("Countdown", "城内城外", "zh")).toBe("城内城外");
  });

  it("returns the English text when the language is en", () => {
    expect(pickText("Countdown", "城内城外", "en")).toBe("Countdown");
  });
});

describe("categoryLabel", () => {
  it("returns the category's label in the given language", () => {
    expect(categoryLabel("Food - Dairy & Bakery", "zh")).toBe("食品-乳制品烘焙");
    expect(categoryLabel("Food - Dairy & Bakery", "en")).toBe("Food - Dairy & Bakery");
  });

  it("falls back to the raw value for an unrecognized category", () => {
    expect(categoryLabel("Something Unlisted", "zh")).toBe("Something Unlisted");
  });
});
