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
  FREE_TRIAL_LIMIT: 5,
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
  credit: { mode: "trial" as const, callsUsed: 0 },
};

const BEN_BLOCKED = {
  userId: "u2",
  displayName: "Ben Wu",
  email: "ben@example.com",
  circleName: "Chen Family",
  role: "member",
  joinedAt: "2026-02-10T00:00:00Z",
  banned: false,
  credit: { mode: "trial" as const, callsUsed: 5 },
};

const CARL = {
  userId: "u3",
  displayName: "Carl Wu",
  email: "carl@example.com",
  circleName: "Chen Family",
  role: "member",
  joinedAt: "2026-03-01T00:00:00Z",
  banned: false,
  credit: { mode: "trial" as const, callsUsed: 0 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
}

function openCustomGrant(amount: string) {
  fireEvent.click(screen.getByRole("button", { name: "Custom…" }));
  fireEvent.change(screen.getByPlaceholderText("e.g. 5.00"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Grant" }));
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

  // Issue 22: a grant is a reset, never a top-up, so an admin must never be
  // left guessing whether one landed. Every failure path gets a visible message.
  it("refuses an unparseable custom amount with a visible message, without calling the backend", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);

    renderPage();
    await screen.findByText("Ben Wu");

    openCustomGrant("abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(/greater than 0/i);
    expect(grantAdminCredit).not.toHaveBeenCalled();
  });

  // parseFloat("Infinity") is a number and passes a NaN/<=0 guard, but the
  // backend refuses it (issue 21) — the frontend guard matches isFinite so the
  // two agree on which inputs are invalid.
  it("refuses a non-finite custom amount without calling the backend", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);

    renderPage();
    await screen.findByText("Ben Wu");

    openCustomGrant("Infinity");

    expect(await screen.findByRole("alert")).toHaveTextContent(/greater than 0/i);
    expect(grantAdminCredit).not.toHaveBeenCalled();
  });

  it("keeps the typed amount so a rejected grant can be corrected rather than retyped", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);

    renderPage();
    await screen.findByText("Ben Wu");

    fireEvent.click(screen.getByRole("button", { name: "Custom…" }));
    const input = screen.getByPlaceholderText("e.g. 5.00");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));

    await screen.findByRole("alert");
    expect(input).toHaveValue("-5");
  });

  it("surfaces the server's message when a grant fails", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);
    vi.mocked(grantAdminCredit).mockRejectedValue(new Error("capUsd must be a positive number"));

    renderPage();
    await screen.findByText("Ben Wu");

    fireEvent.click(screen.getByRole("button", { name: "Grant $1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("capUsd must be a positive number");
  });

  // Supabase's PostgrestError is a plain object, not an Error (CLAUDE.md), so
  // the card must read it through errorMessage() rather than instanceof Error.
  it("surfaces a plain-object rejection's message when a ban fails", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE]);
    vi.mocked(setAdminUserBanned).mockRejectedValue({ message: "permission denied for table users" });

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(1\)/));
    await screen.findByText("Alice Chen");

    fireEvent.click(screen.getByRole("button", { name: "Ban account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied for table users");
  });

  it("clears a card's error once a later action succeeds", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);
    vi.mocked(grantAdminCredit).mockRejectedValueOnce(new Error("grant blew up")).mockResolvedValue(undefined);

    renderPage();
    await screen.findByText("Ben Wu");

    fireEvent.click(screen.getByRole("button", { name: "Grant $1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("grant blew up");

    fireEvent.click(screen.getByRole("button", { name: "Grant $1" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("surfaces a failed merge without hiding the roster", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE, CARL]);
    vi.mocked(mergeUsersIntoCircle).mockRejectedValue(new Error("cannot merge a multi-member circle"));

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(2\)/));
    await screen.findByText("Alice Chen");

    fireEvent.click(screen.getByRole("checkbox", { name: /select alice chen/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select carl wu/i }));
    fireEvent.click(screen.getByRole("button", { name: /merge 2 users into a circle/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot merge a multi-member circle");
    // The selection survives so the admin can retry or adjust it.
    expect(screen.getByRole("button", { name: /merge 2 users into a circle/i })).toBeInTheDocument();
    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
  });

  // parseFloat("5abc") is 5, so a typo'd amount would silently reset the user's
  // cap to a number they never typed — the exact failure class issue 15
  // decision 4 (a grant is a reset, not a top-up) makes expensive.
  it("refuses a custom amount with trailing junk rather than granting the number it starts with", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);

    renderPage();
    await screen.findByText("Ben Wu");

    openCustomGrant("5abc");

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(grantAdminCredit).not.toHaveBeenCalled();
  });

  // A flagged user is rendered twice — once in the needs-attention queue, once
  // in the circle roster — so the failure has to reach both copies, or the
  // admin can scroll to a card that looks like nothing went wrong.
  it("shows a failed action on every card for that user, not just the clicked one", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([BEN_BLOCKED]);
    vi.mocked(grantAdminCredit).mockRejectedValue(new Error("grant blew up"));

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(1\)/));
    await waitFor(() => expect(screen.getAllByText("Ben Wu")).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Grant $1" })[0]);

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    for (const alert of screen.getAllByRole("alert")) {
      expect(alert).toHaveTextContent("grant blew up");
    }
  });

  it("drops a stale merge error once the selection behind it is cleared", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue([ALICE, CARL]);
    vi.mocked(mergeUsersIntoCircle).mockRejectedValue(new Error("cannot merge a multi-member circle"));

    renderPage();
    fireEvent.click(await screen.findByText(/Chen Family \(2\)/));
    await screen.findByText("Alice Chen");

    fireEvent.click(screen.getByRole("checkbox", { name: /select alice chen/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select carl wu/i }));
    fireEvent.click(screen.getByRole("button", { name: /merge 2 users into a circle/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
