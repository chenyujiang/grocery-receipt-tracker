import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "@/lib/LanguageProvider";

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
    localStorage.setItem("language", "zh");

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
    expect(localStorage.getItem("language")).toBe("zh");
  });
});
