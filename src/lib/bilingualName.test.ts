import { describe, it, expect } from "vitest";
import { bilingualName } from "@/lib/bilingualName";

describe("bilingualName", () => {
  it("reads back both languages when a Translation exists", () => {
    expect(bilingualName("Anchor Blue Milk", "安佳蓝牛奶")).toEqual({
      en: "Anchor Blue Milk",
      zh: "安佳蓝牛奶",
    });
  });

  // CONTEXT.md, Bilingual Name: "Reading a Bilingual Name in either language
  // always yields text — a Product whose Translation was never produced reads
  // back as its Source Text, not as blank."
  it("reads an untranslated name back as its Source Text, never as blank", () => {
    expect(bilingualName("Anchor Blue Milk", null)).toEqual({
      en: "Anchor Blue Milk",
      zh: "Anchor Blue Milk",
    });
  });

  it("treats a missing Translation the same as an absent one", () => {
    expect(bilingualName("Anchor Blue Milk", undefined).zh).toBe("Anchor Blue Milk");
  });

  it("composes: a Product's canonical pair wins over the receipt's raw pair", () => {
    // The shape every call site that has both pairs uses — the Product's
    // name when it is matched, the line's own OCR text when it isn't.
    const canonical = { en: "Anchor Blue Milk", zh: "安佳蓝牛奶" };
    const raw = { en: "ANCHR BLU MLK 2L", zh: null };

    expect(bilingualName(canonical.en ?? raw.en, canonical.zh ?? raw.zh)).toEqual({
      en: "Anchor Blue Milk",
      zh: "安佳蓝牛奶",
    });
  });

  it("composes: falls through to the raw Source Text when neither side is translated", () => {
    const canonical = { en: null, zh: null };
    const raw = { en: "ANCHR BLU MLK 2L", zh: null };

    expect(bilingualName(canonical.en ?? raw.en, canonical.zh ?? raw.zh)).toEqual({
      en: "ANCHR BLU MLK 2L",
      zh: "ANCHR BLU MLK 2L",
    });
  });
});
