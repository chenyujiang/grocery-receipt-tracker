import { CATEGORIES } from "@/types";

export type Language = "en" | "zh";

// Section 7: dynamic content (product/store names, category labels) is
// bilingual and switches with the language toggle; fixed UI chrome stays
// English-only and untouched by this.
export function pickText(en: string, zh: string, language: Language): string {
  return language === "zh" ? zh : en;
}

export function categoryLabel(category: string, language: Language): string {
  const entry = CATEGORIES.find((c) => c.en === category);
  if (!entry) {
    return category;
  }
  return pickText(entry.en, entry.zh, language);
}
