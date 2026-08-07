import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// @/lib/adminApi is the boundary — its own Supabase/fetch behavior is
// already covered by adminApi.test.ts; this only checks the page's UI
// behavior (issue 15's needs-attention queue + circle-grouped roster).
vi.mock("@/lib/adminApi", () => ({
  fetchAdminUsers: vi.fn(),
  grantAdminCredit: vi.fn(),
  setAdminUserBanned: vi.fn(),
  mergeUsersIntoCircle: vi.fn(),
}));

import { fetchAdminUsers, grantAdminCredit, setAdminUserBanned, mergeUsersIntoCircle } from "@/lib/adminApi";
import AdminDashboard from "@/pages/AdminDashboard";

const ALICE = {
  userId: "u1",
  displayName: "Alice Chen",
  email: "alice@example.com",
  circleName: "Chen Family",
  role: "owner",
  joinedAt: "2026-01-05T00:00:00Z",
  banned: false,
  credit: { mode: "trial" as const, trialUsed: false },
};

const BEN_BLOCKED = {
  userId: "u2",
  displayName: "Ben Wu",
  email: "ben@example.com",
  circleName: "Chen Family",
  role: "member",
  joinedAt: "2026-02-10T00:00:00Z",
  banned: false,
  credit: { mode: "trial" as const, trialUsed: true },
};

const CARL = {
  userId: "u3",
  displayName: "Carl Wu",
  email: "carl@example.com",
  circleName: "Chen Family",
  role: "member",
  joinedAt: "2026-03-01T00:00:00Z",
  banned: false,
  credit: { mode: "trial" as const, trialUsed: false },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows blocked users in the needs-attention queue and the rest grouped by circle", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE, BEN_BLOCKED]);

    renderPage();

    expect(await screen.findByText("Needs attention (1)")).toBeInTheDocument();
    expect(screen.getByText("Ben Wu")).toBeInTheDocument();
    expect(screen.getByText(/Chen Family \(2\)/)).toBeInTheDocument();
  });

  it("shows a reassuring message when nobody is blocked", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE]);

    renderPage();

    expect(await screen.findByText("Needs attention (0)")).toBeInTheDocument();
    expect(screen.getByText(/nobody is blocked/i)).toBeInTheDocument();
  });

  it("grants $1 credit and reloads when the button is clicked", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);
    vi.mocked(grantAdminCredit).mockResolvedValue(undefined);

    renderPage();
    await screen.findByText("Ben Wu");

    fireEvent.click(screen.getByRole("button", { name: "Grant $1" }));

    expect(grantAdminCredit).toHaveBeenCalledWith("u2");
    expect(await screen.findByText(/Needs attention/)).toBeInTheDocument();
    expect(fetchAdminUsers).toHaveBeenCalledTimes(2);
  });

  it("bans an account and reloads when the ban button is clicked", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE]);
    vi.mocked(setAdminUserBanned).mockResolvedValue(undefined);

    renderPage();
    // Expand the Chen Family group to reach Alice's card actions.
    fireEvent.click(await screen.findByText(/Chen Family \(1\)/));
    await screen.findByText("Alice Chen");

    fireEvent.click(screen.getByRole("button", { name: "Ban account" }));

    expect(setAdminUserBanned).toHaveBeenCalledWith("u1", true);
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchAdminUsers).mockRejectedValue(new Error("network error"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });

  it("does not show the merge button until at least 2 users are selected", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE, CARL]);

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(2\)/));
    await screen.findByText("Alice Chen");

    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /select alice chen/i }));
    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /select carl wu/i }));
    expect(screen.getByRole("button", { name: /merge 2 users into a circle/i })).toBeInTheDocument();
  });

  it("merges the selected users, clears the selection, and reloads", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE, CARL]);
    vi.mocked(mergeUsersIntoCircle).mockResolvedValue("new-circle-1");

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(2\)/));
    await screen.findByText("Alice Chen");

    fireEvent.click(screen.getByRole("checkbox", { name: /select alice chen/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select carl wu/i }));
    fireEvent.click(screen.getByRole("button", { name: /merge 2 users into a circle/i }));

    expect(mergeUsersIntoCircle).toHaveBeenCalledWith(["u1", "u3"]);
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();
  });
});
