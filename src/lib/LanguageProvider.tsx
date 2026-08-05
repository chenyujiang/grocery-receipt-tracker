import { createContext, useContext, useState, type ReactNode } from "react";
import type { Language } from "@/lib/bilingual";
import { translate, type TranslationKey } from "@/lib/i18n";

const STORAGE_KEY = "language";
const DEFAULT_LANGUAGE: Language = "en";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
});

function readStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "zh" || stored === "en" ? stored : DEFAULT_LANGUAGE;
}

// Section 7: the language toggle — a client-side display preference (not
// data), so it lives in localStorage rather than a profiles column. `t`
// covers fixed UI chrome (src/lib/i18n.ts); dynamic data (product/store
// names) uses src/lib/bilingual.ts's pickText/categoryLabel instead, since
// those come from _en/_zh columns rather than a translation dictionary.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  function setLanguage(next: Language) {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
  }

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    return translate(language, key, params);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
