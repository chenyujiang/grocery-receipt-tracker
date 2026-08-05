import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/auth and @/lib/adminApi are the boundaries — their own Supabase
// behavior is covered by their own tests; this only checks issue 15
// decision 8's post-login redirect (admin -> dashboard, everyone else -> "/").
vi.mock("@/lib/auth", () => ({
  signInWithEmail: vi.fn(),
}));
vi.mock("@/lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/adminApi")>("@/lib/adminApi");
  return { ...actual, isGlobalAdmin: vi.fn() };
});

import { signInWithEmail } from "@/lib/auth";
import { isGlobalAdmin, ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";
import Auth from "@/pages/Auth";

function renderAuthFlow() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<p>Home page</p>} />
        <Route path={ADMIN_DASHBOARD_PATH} element={<p>Admin dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitSignIn() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "eason@example.com" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a non-admin to '/' after signing in", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ userId: "user-1", accessToken: "tok-1" });
    vi.mocked(isGlobalAdmin).mockResolvedValue(false);

    renderAuthFlow();
    await submitSignIn();

    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });

  it("sends a global admin to the admin dashboard after signing in", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ userId: "admin-1", accessToken: "tok-1" });
    vi.mocked(isGlobalAdmin).mockResolvedValue(true);

    renderAuthFlow();
    await submitSignIn();

    expect(await screen.findByText("Admin dashboard")).toBeInTheDocument();
  });

  it("still sends the user to '/' if the admin check itself fails", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({ userId: "user-1", accessToken: "tok-1" });
    vi.mocked(isGlobalAdmin).mockRejectedValue(new Error("network error"));

    renderAuthFlow();
    await submitSignIn();

    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());
  });
});
