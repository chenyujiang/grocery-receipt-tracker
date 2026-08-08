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

// auth.ts's circle/profile inserts deliberately don't chain .select() (see
// its comment — RETURNING would hit a not-yet-satisfiable RLS SELECT
// policy for a brand-new user), so the mock only needs to resolve {error}.
function insertChain(result: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(result);
  return { insert };
}

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a user sign up and reports the new owner profile", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("circle-1" as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    } as never);

    const circlesChain = insertChain({ error: null });
    const profilesChain = insertChain({ error: null });
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
