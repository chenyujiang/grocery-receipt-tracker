import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import SignInForm from "@/components/SignInForm";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a returning user sign in", async () => {
    // ensureProfile's existence check — this user already has a profile, so
    // sign-in should short-circuit without touching circles/profiles inserts.
    // `circles` is left unprepared, so an insert there would throw.
    installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: { id: "user-1" }, session: { access_token: "tok-1" } },
          error: null,
        },
      },
      tables: { profiles: { data: { user_id: "user-1" }, error: null } },
    });

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
    installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: null, session: null },
          error: new Error("Invalid login credentials"),
        },
      },
    });

    render(<SignInForm onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "returning@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });
});
