import { describe, it, expect } from "vitest";
import { roleLabel, translate, type TranslationKey } from "@/lib/i18n";

describe("translate", () => {
  it("returns the string for the given language", () => {
    expect(translate("en", "home.title")).toBe("Home");
    expect(translate("zh", "home.title")).toBe("首页");
  });

  it("interpolates {param} placeholders", () => {
    expect(translate("en", "product.estimatedDaysRemaining", { days: 4 })).toBe(
      "Estimated 4 days remaining"
    );
    expect(translate("zh", "product.estimatedDaysRemaining", { days: 4 })).toBe("预计还能用 4 天");
  });
});

describe("roleLabel", () => {
  it("labels each role through the given translator", () => {
    const zh = (key: TranslationKey) => translate("zh", key);
    expect(roleLabel("owner", zh)).toBe("拥有者");
    expect(roleLabel("member", zh)).toBe("成员");
  });
});
