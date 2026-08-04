import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Supabase is the external boundary — mocked here. auth.ts itself is our own
// module and is exercised for real, so this test verifies the actual wiring
// between the form and the sign-up logic, not a mock of our own code.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { signUp: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import SignUpForm from "@/components/SignUpForm";

function insertChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert };
}

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a user sign up and reports the new owner profile", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    } as never);

    const circlesChain = insertChain({ data: { id: "circle-1" }, error: null });
    const profilesChain = insertChain({
      data: { user_id: "user-1", circle_id: "circle-1", role: "owner" },
      error: null,
    });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "circles") return circlesChain as never;
      if (table === "profiles") return profilesChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    const onSuccess = vi.fn();
    render(<SignUpForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2pass");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        userId: "user-1",
        circleId: "circle-1",
        role: "owner",
      });
    });
  });

  it("shows an error message when sign-up fails", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("User already registered"),
    } as never);

    render(<SignUpForm onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2pass");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("User already registered");
  });
});
