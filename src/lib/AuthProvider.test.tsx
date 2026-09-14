import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";

function TestConsumer() {
  const { session, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  return <p>{session ? `Signed in as ${session.userId}` : "Signed out"}</p>;
}

const SIGNED_IN = {
  getSession: { data: { session: { user: { id: "user-1" }, access_token: "tok-1" } } },
};

describe("AuthProvider / useAuth", () => {
  it("shows the existing session once it resolves", async () => {
    installFakeSupabase(supabase, { auth: SIGNED_IN });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Signed in as user-1")).toBeInTheDocument();
  });

  it("shows signed out when there is no existing session", async () => {
    installFakeSupabase(supabase, { auth: { getSession: { data: { session: null } } } });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });

  it("updates when the auth state changes after mount (e.g. sign-out)", async () => {
    const db = installFakeSupabase(supabase, { auth: SIGNED_IN });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await screen.findByText("Signed in as user-1");

    // The provider subscribed on mount; the fake recorded the callback it
    // handed over, so the test can drive it.
    const [emitAuthChange] = db.auth.onAuthStateChange.mock.calls[0];
    act(() => {
      emitAuthChange("SIGNED_OUT", null);
    });

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });
});
