import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Supabase is the external boundary — mocked here. auth.ts itself is our own
// module and is exercised for real, so this test verifies the actual wiring
// between the form and the sign-up logic, not a mock of our own code.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import SignUpForm from "@/components/SignUpForm";

// auth.ts's circle/profile inserts deliberately don't chain .select() (see
// its comment — RETURNING would hit a not-yet-satisfiable RLS SELECT
// policy for a brand-new user), so a prepared {error} is the whole result.
const INSERTED = { error: null };

/** Enough dashes to satisfy crypto.randomUUID's template-literal return type. */
const CIRCLE_ID = "circle-0000-0000-0000-000000000001";

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a user sign up and reports the new owner profile", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(CIRCLE_ID);
    const db = installFakeSupabase(supabase, {
      auth: { signUp: { data: { user: { id: "user-1" }, session: null }, error: null } },
      tables: { circles: INSERTED, profiles: INSERTED },
    });

    const onSuccess = vi.fn();
    render(<SignUpForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2pass");
    await userEvent.type(screen.getByLabelText(/display name/i), "New User");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        userId: "user-1",
        circleId: CIRCLE_ID,
        role: "owner",
      });
    });
    expect(db.callsFor("profiles")).toContainEqual([
      "insert",
      expect.objectContaining({ display_name: "New User" }),
    ]);
  });

  it("shows an error message when sign-up fails", async () => {
    installFakeSupabase(supabase, {
      auth: {
        signUp: {
          data: { user: null, session: null },
          error: new Error("User already registered"),
        },
      },
    });

    render(<SignUpForm onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2pass");
    await userEvent.type(screen.getByLabelText(/display name/i), "Taken User");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("User already registered");
  });
});
