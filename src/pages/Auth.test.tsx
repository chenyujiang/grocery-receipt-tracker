import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// @/lib/auth and @/lib/adminApi are the boundaries — their own Supabase
// behavior is covered by their own tests; this only checks issue 15
// decision 8's post-login redirect (admin -> dashboard, everyone else -> "/")
// plus the post-signup justSignedUp router state.
vi.mock("@/lib/auth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}));
vi.mock("@/lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/adminApi")>("@/lib/adminApi");
  return { ...actual, isGlobalAdmin: vi.fn() };
});

import { signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { isGlobalAdmin, ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";
import Auth from "@/pages/Auth";

function HomeRouteProbe() {
  const location = useLocation();
  const justSignedUp = Boolean((location.state as { justSignedUp?: boolean } | null)?.justSignedUp);
  return <p>Home page{justSignedUp ? " (just signed up)" : ""}</p>;
}

function renderAuthFlow() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<HomeRouteProbe />} />
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

  it("marks the redirect as just-signed-up after a non-admin signs up", async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue({
      userId: "user-2",
      circleId: "circle-2",
      role: "owner",
    });
    vi.mocked(isGlobalAdmin).mockResolvedValue(false);

    renderAuthFlow();
    fireEvent.click(screen.getByRole("button", { name: /sign up instead/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "New User" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByText("Home page (just signed up)")).toBeInTheDocument();
  });
});
