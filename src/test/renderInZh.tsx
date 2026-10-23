import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "@/lib/LanguageProvider";

// Renders a page with the display language toggled to Chinese, the way
// LanguageProvider would find it after a user picked it. setup.ts clears
// localStorage after every test, so the choice doesn't leak into the next one.
export function renderInZh(ui: ReactElement) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
  return render(
    <MemoryRouter>
      <LanguageProvider>{ui}</LanguageProvider>
    </MemoryRouter>
  );
}
