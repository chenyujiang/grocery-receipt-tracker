import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
  },
}));

import { supabase } from "@/lib/supabaseClient";
import SignInForm from "@/components/SignInForm";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a returning user sign in", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "tok-1" } },
      error: null,
    } as never);

    const onSuccess = vi.fn();
    render(<SignInForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/email/i), "returning@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ userId: "user-1", accessToken: "tok-1" });
    });
  });

  it("shows an error message when credentials are invalid", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Invalid login credentials"),
    } as never);

    render(<SignInForm onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "returning@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });
});
