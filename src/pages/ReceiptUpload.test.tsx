import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts is the boundary — its own Supabase/fetch behavior is
// already covered by receipts.test.ts; this only checks the page's UI
// behavior (loading state, navigation, error display).
vi.mock("@/lib/receipts", () => ({
  uploadReceipt: vi.fn(),
}));

import { uploadReceipt } from "@/lib/receipts";
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

function makeFile() {
  return new File(["fake-image-bytes"], "receipt.jpg", { type: "image/jpeg" });
}

describe("ReceiptUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("shows an error message when the upload fails", async () => {
    vi.mocked(uploadReceipt).mockRejectedValue(new Error("AI recognition quota used up"));

    renderUploadPage();
    const input = screen.getByLabelText(/take photo|choose image|拍照|选择图片/i, {
      selector: "input",
    });
    await userEvent.upload(input, makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("AI recognition quota used up");
  });
});
