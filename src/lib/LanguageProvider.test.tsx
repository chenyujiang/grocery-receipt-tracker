import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LANGUAGE_STORAGE_KEY, LanguageProvider, useLanguage } from "@/lib/LanguageProvider";

function TestConsumer() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <p>Current: {language}</p>
      <button type="button" onClick={() => setLanguage("zh")}>
        Switch to ZH
      </button>
    </div>
  );
}

describe("LanguageProvider / useLanguage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to English when nothing is stored", () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(screen.getByText("Current: en")).toBeInTheDocument();
  });

  it("reads a previously stored language preference", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(screen.getByText("Current: zh")).toBeInTheDocument();
  });

  it("updates and persists the preference when changed", async () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: /switch to zh/i }));

    expect(screen.getByText("Current: zh")).toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
  });
});
