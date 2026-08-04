import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";

function TestConsumer() {
  const { session, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  return <p>{session ? `Signed in as ${session.userId}` : "Signed out"}</p>;
}

function unsubscribableChange() {
  return { data: { subscription: { unsubscribe: vi.fn() } } } as never;
}

describe("AuthProvider / useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the existing session once it resolves", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "user-1" }, access_token: "tok-1" } },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Signed in as user-1")).toBeInTheDocument();
  });

  it("shows signed out when there is no existing session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });

  it("updates when the auth state changes after mount (e.g. sign-out)", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "user-1" }, access_token: "tok-1" } },
    } as never);

    let emitAuthChange: (event: string, session: unknown) => void = () => {};
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      emitAuthChange = callback as never;
      return unsubscribableChange();
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await screen.findByText("Signed in as user-1");

    act(() => {
      emitAuthChange("SIGNED_OUT", null);
    });

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });
});
