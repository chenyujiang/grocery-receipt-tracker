import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts is the boundary — its own Supabase/fetch behavior is
// already covered by receipts.test.ts; this only checks the page's UI
// behavior (loading state, navigation, error display).
vi.mock("@/lib/receipts", () => ({
  uploadReceipt: vi.fn(),
}));
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { uploadReceipt } from "@/lib/receipts";
import { useAuth } from "@/lib/AuthProvider";
import { AiAccessRefusedError, SUPPORT_EMAIL } from "@/lib/aiAccessRefusal";
import { FREE_TRIAL_LIMIT } from "@/lib/freeTrialLimit";
import { renderInZh } from "@/test/renderInZh";
import { useLanguage } from "@/lib/LanguageProvider";
import ReceiptUpload from "@/pages/ReceiptUpload";

function renderUploadPage() {
  return render(
    <MemoryRouter initialEntries={["/upload"]}>
      <Routes>
        <Route path="/upload" element={<ReceiptUpload />} />
        <Route path="/receipts/:receiptId/review" element={<p>Review page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

// Stands in for the app shell's language toggle, which isn't on this page.
function SwitchToEnglish() {
  const { setLanguage } = useLanguage();
  return (
    <button type="button" onClick={() => setLanguage("en")}>
      English
    </button>
  );
}

function makeFile() {
  return new File(["fake-image-bytes"], "receipt.jpg", { type: "image/jpeg" });
}

describe("ReceiptUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: "user-1", email: "ann@example.com", accessToken: "tok" },
      loading: false,
    });
  });

  it("uploads the selected file and navigates to the review page", async () => {
    vi.mocked(uploadReceipt).mockResolvedValue({ receiptId: "receipt-1" });

    renderUploadPage();
    const input = screen.getByLabelText(/take photo|choose image|拍照|选择图片/i, {
      selector: "input",
    });
    await userEvent.upload(input, makeFile());

    expect(await screen.findByText("Review page")).toBeInTheDocument();
    expect(uploadReceipt).toHaveBeenCalledWith(expect.objectContaining({ name: "receipt.jpg" }));
  });

  it("shows a full-screen loading overlay while recognizing, and removes it once done", async () => {
    let resolveUpload: (result: { receiptId: string }) => void = () => {};
    vi.mocked(uploadReceipt).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );

    renderUploadPage();
    const input = screen.getByLabelText(/take photo|choose image|拍照|选择图片/i, {
      selector: "input",
    });
    await userEvent.upload(input, makeFile());

    expect(await screen.findByRole("status")).toBeInTheDocument();

    resolveUpload({ receiptId: "receipt-1" });

    await waitForElementToBeRemoved(() => screen.queryByRole("status"));
  });

  it("shows an error message when the upload fails", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(new Error("Invalid or expired session"));

    renderUploadPage();
    const input = screen.getByLabelText(/take photo|choose image|拍照|选择图片/i, {
      selector: "input",
    });
    await userEvent.upload(input, makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired session");
  });

  // Spec Section 7: the refusal is the app's own copy, so it follows the
  // language toggle like the rest of the chrome.
  it("tells a user whose Free Trial is used up how to get unblocked, in the chosen language", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(new AiAccessRefusedError({ code: "ai_trial_exhausted" }));

    renderInZh(<ReceiptUpload />);
    await userEvent.upload(screen.getByLabelText(/拍照|选择图片/, { selector: "input" }), makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `你已用完全部 ${FREE_TRIAL_LIMIT} 次免费 AI 识别。请发邮件至 ${SUPPORT_EMAIL} 申请额度。`
    );
  });

  // Spend is summed per-call costs, so a raw float like 0.8200000000000001
  // must not reach the user verbatim.
  it("tells a user whose AI Credit is used up their spend against the cap, to the cent", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(
      new AiAccessRefusedError({ code: "ai_credit_exhausted", spentUsd: 0.8200000000000001, capUsd: 0.8 })
    );

    renderInZh(<ReceiptUpload />);
    await userEvent.upload(screen.getByLabelText(/拍照|选择图片/, { selector: "input" }), makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `AI 识别额度已用完（已用 $0.82 / $0.80）。请发邮件至 ${SUPPORT_EMAIL} 申请额度。`
    );
  });

  // Spec Section 16: the way out is a mailto: link that opens the user's own
  // email client on a pre-filled draft — no email is sent by the app. The
  // draft names the account, so the admin knows whom to grant credit to.
  it("links a refused user to a pre-filled email draft to the admin", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(new AiAccessRefusedError({ code: "ai_trial_exhausted" }));

    renderInZh(<ReceiptUpload />);
    await userEvent.upload(screen.getByLabelText(/拍照|选择图片/, { selector: "input" }), makeFile());

    const link = await screen.findByRole("link", { name: "发邮件申请额度" });
    const draft = new URL(link.getAttribute("href") ?? "");
    expect(draft.protocol).toBe("mailto:");
    expect(draft.pathname).toBe(SUPPORT_EMAIL);
    expect(draft.searchParams.get("subject")).toBe("申请 AI 识别额度");
    expect(draft.searchParams.get("body")).toBe(
      "你好，我想为我的账号申请 AI 识别额度。\n\n邮箱：ann@example.com\n用户 ID：user-1"
    );
  });

  it("rewords a refusal already on screen when the user switches language", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(new AiAccessRefusedError({ code: "ai_trial_exhausted" }));

    renderInZh(
      <>
        <SwitchToEnglish />
        <ReceiptUpload />
      </>
    );
    await userEvent.upload(screen.getByLabelText(/拍照|选择图片/, { selector: "input" }), makeFile());
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      `You've already used all ${FREE_TRIAL_LIMIT} of your free AI recognitions. Email ${SUPPORT_EMAIL} to get credit assigned.`
    );
    expect(screen.getByRole("link", { name: "Email to request credit" })).toBeInTheDocument();
  });
});
