import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// @/lib/auth is the boundary — signOut's own Supabase behavior is already
// covered by auth.test.ts; this only checks the page's UI behavior.
vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(),
}));

import { signOut } from "@/lib/auth";
import CircleSettings from "@/pages/CircleSettings";

describe("CircleSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs the user out when the sign-out button is clicked", async () => {
    vi.mocked(signOut).mockResolvedValue(undefined);

    render(<CircleSettings />);
    await userEvent.click(screen.getByRole("button", { name: /sign out|退出登录/i }));

    expect(signOut).toHaveBeenCalled();
  });

  it("shows an error message if sign-out fails", async () => {
    vi.mocked(signOut).mockRejectedValue(new Error("network error"));

    render(<CircleSettings />);
    await userEvent.click(screen.getByRole("button", { name: /sign out|退出登录/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
