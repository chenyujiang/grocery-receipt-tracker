import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderInZh } from "@/test/renderInZh";
import NotFound from "@/pages/NotFound";

describe("NotFound", () => {
  // Spec Section 7: fixed UI chrome follows the language toggle, this page
  // included (it's also what a non-admin sees at the admin route).
  it("is worded in the chosen language", () => {
    renderInZh(<NotFound />);

    expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(screen.getByText("你访问的页面不存在。")).toBeInTheDocument();
  });
});
