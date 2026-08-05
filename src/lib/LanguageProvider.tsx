import { createContext, useContext, useState, type ReactNode } from "react";
import type { Language } from "@/lib/bilingual";

const STORAGE_KEY = "language";
const DEFAULT_LANGUAGE: Language = "en";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
});

function readStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "zh" || stored === "en" ? stored : DEFAULT_LANGUAGE;
}

// Section 7: the bilingual toggle — a client-side display preference (not
// data), so it lives in localStorage rather than a profiles column.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  function setLanguage(next: Language) {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
