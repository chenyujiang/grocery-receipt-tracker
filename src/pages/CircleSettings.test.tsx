import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Each of these is a boundary whose own behavior is covered by its own test
// file (auth.test.ts, circleMembers.test.ts, circleActions.test.ts); this
// only checks the page's UI behavior.
vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(),
}));
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/lib/LanguageProvider", () => ({
  useLanguage: vi.fn(),
}));
vi.mock("@/lib/circleMembers", () => ({
  fetchCircleMembers: vi.fn(),
}));
vi.mock("@/lib/circleActions", () => ({
  updateOwnDisplayName: vi.fn(),
  removeMember: vi.fn(),
  dissolveCircle: vi.fn(),
}));

import { signOut } from "@/lib/auth";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { fetchCircleMembers } from "@/lib/circleMembers";
import { updateOwnDisplayName, removeMember, dissolveCircle } from "@/lib/circleActions";
import CircleSettings from "@/pages/CircleSettings";

const OWNER = { userId: "user-1", displayName: "eason", role: "owner" as const, circleId: "circle-1" };
const MEMBER = { userId: "user-2", displayName: "kelly", role: "member" as const, circleId: "circle-1" };

describe("CircleSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: "user-1", accessToken: "tok" },
      loading: false,
    });
    vi.mocked(useLanguage).mockReturnValue({ language: "en", setLanguage: vi.fn() });
  });

  it("loads and displays the circle's members with their roles", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER, MEMBER]);

    render(<CircleSettings />);

    expect(await screen.findByText(/kelly/)).toBeInTheDocument();
    expect(screen.getByText(/\(member\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(owner\)/)).toBeInTheDocument();
  });

  it("lets the user switch the display language", async () => {
    const setLanguage = vi.fn();
    vi.mocked(useLanguage).mockReturnValue({ language: "en", setLanguage });
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER]);

    render(<CircleSettings />);
    await screen.findByText(/eason/);

    const zhOption = screen.getByRole("radio", { name: "中文" });
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(zhOption).not.toBeChecked();

    await userEvent.click(zhOption);

    expect(setLanguage).toHaveBeenCalledWith("zh");
  });

  it("lets the signed-in member save a new display name", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER, MEMBER]);
    vi.mocked(updateOwnDisplayName).mockResolvedValue(undefined);

    render(<CircleSettings />);
    await screen.findByText(/kelly/);

    const nameInput = screen.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Eason C");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateOwnDisplayName).toHaveBeenCalledWith("user-1", "Eason C");
  });

  it("lets the owner remove another member, but not themselves", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER, MEMBER]);
    vi.mocked(removeMember).mockResolvedValue(undefined);

    render(<CircleSettings />);
    await screen.findByText(/kelly/);

    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(removeMember).toHaveBeenCalledWith("user-2");
  });

  it("hides remove buttons and the dissolve section from a non-owner member", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: "user-2", accessToken: "tok" },
      loading: false,
    });
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER, MEMBER]);

    render(<CircleSettings />);
    await screen.findByText(/kelly/);

    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/dissolve circle/i)).not.toBeInTheDocument();
  });

  it("only allows dissolving the circle after typing the confirmation text", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER, MEMBER]);
    vi.mocked(dissolveCircle).mockResolvedValue(undefined);
    vi.mocked(signOut).mockResolvedValue(undefined);

    render(<CircleSettings />);
    await screen.findByText(/kelly/);

    const dissolveButton = screen.getByRole("button", { name: /^dissolve circle$/i });
    expect(dissolveButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Confirm"), "DISSOLVE");
    expect(dissolveButton).toBeEnabled();

    await userEvent.click(dissolveButton);

    expect(dissolveCircle).toHaveBeenCalledWith("circle-1");
    expect(signOut).toHaveBeenCalled();
  });

  it("signs the user out when the sign-out button is clicked", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER]);
    vi.mocked(signOut).mockResolvedValue(undefined);

    render(<CircleSettings />);
    await screen.findByText(/eason/);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalled();
  });

  it("shows an error message if sign-out fails", async () => {
    vi.mocked(fetchCircleMembers).mockResolvedValue([OWNER]);
    vi.mocked(signOut).mockRejectedValue(new Error("network error"));

    render(<CircleSettings />);
    await screen.findByText(/eason/);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
