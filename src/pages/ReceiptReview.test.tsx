import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/receipts and @/lib/duplicateCheck are the boundary — their own
// Supabase behavior is already covered by their own test files; this only
// checks the page's UI behavior (loading the draft, editing a field,
// confirming, the duplicate-check banner, navigating away).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
// listStores is the boundary for the picker's options, covered by
// stores.test.ts; the rest of @/lib/stores is pure and runs for real.
vi.mock("@/lib/stores", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stores")>()),
  listStores: vi.fn(),
}));
vi.mock("@/lib/receipts", () => ({
  fetchReceiptDraft: vi.fn(),
  confirmReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  // Pure field strip, not a Supabase call — stubbed with the real behavior so
  // the page's save payload stays meaningful. The strip itself is pinned down
  // in receipts.test.ts.
  toItemUpdate: ({ category: _category, ...item }: { category: unknown }) => item,
}));
vi.mock("@/lib/duplicateCheck", () => ({
  findDuplicateReceipt: vi.fn(),
}));

import { fetchReceiptDraft, confirmReceipt, deleteReceipt } from "@/lib/receipts";
import { listStores } from "@/lib/stores";
import { findDuplicateReceipt } from "@/lib/duplicateCheck";
import ReceiptReview from "@/pages/ReceiptReview";

const SAMPLE_DRAFT = {
  id: "receipt-1",
  uploadedBy: "user-1",
  receiptHeader: { en: "Countdown Newmarket", zh: "倒数超市 Newmarket 店" },
  storeDisplayName: { en: "Countdown Newmarket", zh: "倒数超市 Newmarket 店" },
  recognizedStore: null,
  storeId: null,
  purchaseDate: "2026-08-01",
  totalAmount: 4.5,
  status: "pending_review",
  originalImageUrl: null,
  items: [
    {
      id: "item-1",
      rawNameEn: "Anchor Blue Milk 2L",
      rawNameZh: "安科蓝带牛奶 2升",
      quantity: 1,
      unitSpecValue: 2,
      unitSpecUnit: "L",
      unitPrice: 4.5,
      originalPrice: null,
      isPromotion: false,
      subtotal: 4.5,
      productId: "product-1",
      category: "Food - Dairy & Bakery",
    },
  ],
};

// SAMPLE_DRAFT predates the AI's chain/branch split, so the picker starts on
// its printed header as the chain, with the branch unknown — the header's
// Source Text only, since a Store's names are English only.
const HEADER_AS_CHAIN = {
  chain: { en: "Countdown Newmarket", zh: null },
  branch: null,
};

const HORNBY_STORE = {
  id: "store-hornby",
  chain_name_en: "Woolworths",
  chain_name_zh: "沃尔沃斯",
  branch_name_en: "Hornby",
  branch_name_zh: "霍恩比",
};
const RICCARTON_STORE = {
  id: "store-riccarton",
  chain_name_en: "Woolworths",
  chain_name_zh: "沃尔沃斯",
  branch_name_en: "Riccarton",
  branch_name_zh: "里卡顿",
};
const ALBANY_STORE = {
  id: "store-albany",
  chain_name_en: "PAK'nSAVE",
  chain_name_zh: "派克储蓄",
  branch_name_en: "Albany",
  branch_name_zh: "奥尔巴尼",
};

function renderReviewPage() {
  return render(
    <MemoryRouter initialEntries={["/receipts/receipt-1/review"]}>
      <Routes>
        <Route path="/receipts/:receiptId/review" element={<ReceiptReview />} />
        <Route path="/" element={<p>Home stub</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ReceiptReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDuplicateReceipt).mockResolvedValue(null);
    vi.mocked(listStores).mockResolvedValue([]);
  });

  it("loads and displays the draft's items", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderReviewPage();

    expect(await screen.findByDisplayValue("Anchor Blue Milk 2L")).toBeInTheDocument();
    // Category comes from the Product, so the page shows it as plain text —
    // it's deliberately not one of the editor's fields (spec.md 5.2).
    expect(screen.getByText(/Dairy & Bakery/)).toBeInTheDocument();
    expect(fetchReceiptDraft).toHaveBeenCalledWith("receipt-1");
  });

  it("lets the user edit a field and confirms with the edited value", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();
    const quantityInput = await screen.findByLabelText(/quantity|数量/i);
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "2");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText("Home stub")).toBeInTheDocument();
    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", [
      expect.objectContaining({ id: "item-1", quantity: 2 }),
    ], HEADER_AS_CHAIN);
  });

  // Issue 29: the store picker sits where the store name used to, pre-filled
  // with what the AI read off the header; the Store itself is resolved (or
  // created) by confirmReceipt, never on the page.
  it("pre-fills the store picker with the AI's chain and branch, and confirms with them", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Woolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornby", zh: "霍恩比" },
      },
    });
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    expect(await screen.findByLabelText(/chain|连锁/i)).toHaveValue("Woolworths");
    expect(screen.getByLabelText(/branch|分店/i)).toHaveValue("Hornby");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Hornby", zh: "霍恩比" },
    });
  });

  it("starts a draft with no recognized chain/branch on its printed header as the chain, branch unknown", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderReviewPage();

    expect(await screen.findByLabelText(/store|门店/i)).toHaveValue("unknown");
    expect(screen.getByLabelText(/chain|连锁/i)).toHaveValue("Countdown Newmarket");
  });

  // The AI's Chinese names were translations of what it read; once the user
  // retypes a name they no longer match, so it goes in with no Translation.
  it("confirms with the user's edited chain and branch, dropping their stale translations", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Wolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornbv", zh: "霍恩比" },
      },
    });
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    const chain = await screen.findByLabelText(/chain|连锁/i);
    await userEvent.clear(chain);
    await userEvent.type(chain, "Woolworths");
    const branch = screen.getByLabelText(/branch|分店/i);
    await userEvent.clear(branch);
    await userEvent.type(branch, "Hornby");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "Woolworths", zh: null },
      branch: { en: "Hornby", zh: null },
    });
  });

  // resolveStore refuses a blank chain; the button says so before the user
  // presses it, instead of the confirm failing.
  it("disables confirm while the chain is blank", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderReviewPage();

    const chain = await screen.findByLabelText(/chain|连锁/i);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    await userEvent.clear(chain);
    await userEvent.type(chain, " ");
    expect(confirm).toBeDisabled();
    await userEvent.type(chain, "Woolworths");
    expect(confirm).toBeEnabled();
  });

  // A disabled button alone doesn't say what's wrong; the chain field does.
  it("says under the chain field that a chain is needed while it is blank", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);

    renderReviewPage();

    const chain = await screen.findByLabelText(/chain|连锁/i);
    expect(screen.queryByText(/enter the chain/i)).not.toBeInTheDocument();
    await userEvent.clear(chain);
    expect(chain).toHaveAccessibleDescription(/enter the chain/i);
    await userEvent.type(chain, "Woolworths");
    expect(screen.queryByText(/enter the chain/i)).not.toBeInTheDocument();
  });

  // Matching is on the normalized keys, so the AI's "Pak n Save" finds the
  // Circle's PAK'nSAVE row — and the Store's own names win over the AI's.
  it("pre-selects the existing Store the AI's chain and branch match, and confirms with that Store's names", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Pak n Save", zh: "帕克超市" },
        branch: { en: "Albany", zh: "阿尔巴尼" },
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE, ALBANY_STORE]);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    expect(await screen.findByLabelText(/store|门店/i)).toHaveValue("store-albany");
    // The new-branch fields only show for "new branch".
    expect(screen.queryByLabelText(/chain|连锁/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "PAK'nSAVE", zh: "派克储蓄" },
      branch: { en: "Albany", zh: "奥尔巴尼" },
    });
  });

  it("confirms with the names of whichever existing Store the user picks instead", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Pak n Save", zh: "帕克超市" },
        branch: { en: "Albany", zh: "阿尔巴尼" },
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE, ALBANY_STORE]);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    await userEvent.selectOptions(await screen.findByLabelText(/store|门店/i), "store-hornby");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Hornby", zh: "霍恩比" },
    });
  });

  it("labels an existing Store with no branch as branch unknown", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(listStores).mockResolvedValue([
      {
        id: "store-costco",
        chain_name_en: "Costco",
        chain_name_zh: "好市多",
        branch_name_en: null,
        branch_name_zh: null,
      },
    ]);

    renderReviewPage();

    expect(
      await screen.findByRole("option", { name: "Costco (Branch unknown)" })
    ).toHaveValue("store-costco");
  });

  // For a header whose branch the AI misread and the user can't tell either:
  // the receipt still lands on the chain, as its unknown-branch Store.
  it("confirms with the chain and no branch when the user picks branch unknown", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Woolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornbv", zh: "霍恩比" },
      },
    });
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    await userEvent.selectOptions(await screen.findByLabelText(/store|门店/i), "Branch unknown");
    expect(screen.getByLabelText(/chain|连锁/i)).toHaveValue("Woolworths");
    expect(screen.queryByLabelText(/branch|分店/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: null,
    });
  });

  // Spec: a near-miss offers a candidate list rather than guessing. The chain
  // matched but the branch didn't, so every Store of that chain is offered —
  // and nothing is picked until the user picks one.
  it("offers the chain's Stores as candidates when the branch matches none of them", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Woolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornbv", zh: "霍恩比" },
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE, RICCARTON_STORE, ALBANY_STORE]);

    renderReviewPage();

    const candidates = await screen.findByRole("group", { name: /did you mean/i });
    expect(within(candidates).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Woolworths Hornby",
      "Woolworths Riccarton",
    ]);
    // The candidates' own label mentions Stores too, so find the picker by role.
    expect(screen.getByRole("combobox", { name: /^store$/i })).toHaveValue("new");
  });

  it("confirms with a candidate Store's own names once the user picks it", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Woolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornbv", zh: "霍恩比" },
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE, RICCARTON_STORE, ALBANY_STORE]);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    const candidates = await screen.findByRole("group", { name: /did you mean/i });
    await userEvent.click(within(candidates).getByRole("button", { name: "Woolworths Hornby" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", expect.any(Array), {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Hornby", zh: "霍恩比" },
    });
  });

  it("offers no candidates when the branch matches a Store exactly", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Woolworths", zh: "沃尔沃斯" },
        branch: { en: "Hornby", zh: "霍恩比" },
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE, RICCARTON_STORE, ALBANY_STORE]);

    renderReviewPage();

    expect(await screen.findByRole("combobox", { name: /^store$/i })).toHaveValue("store-hornby");
    expect(screen.queryByRole("group", { name: /did you mean/i })).not.toBeInTheDocument();
  });

  // The header named no branch, so this isn't a new branch — and the picker
  // shouldn't say it is.
  it("starts on branch unknown when the AI read no branch and no Store matches", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue({
      ...SAMPLE_DRAFT,
      recognizedStore: {
        chain: { en: "Costco", zh: "好市多" },
        branch: null,
      },
    });
    vi.mocked(listStores).mockResolvedValue([HORNBY_STORE]);

    renderReviewPage();

    expect(await screen.findByLabelText(/store|门店/i)).toHaveValue("unknown");
    expect(screen.getByLabelText(/chain|连锁/i)).toHaveValue("Costco");
  });

  // Issue 17: the weight/volume spec used to be read-only here and editable
  // only after confirming — so a misread 500g/500kg reached the price-trend
  // math before anyone could fix it. Both flows now share one editor.
  it("lets the user correct the weight/volume spec before confirming", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(confirmReceipt).mockResolvedValue(undefined);

    renderReviewPage();

    const specValue = await screen.findByLabelText(/spec value/i);
    await userEvent.clear(specValue);
    await userEvent.type(specValue, "1");
    await userEvent.selectOptions(screen.getByLabelText(/spec unit/i), "kg");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(confirmReceipt).toHaveBeenCalledWith("receipt-1", [
      expect.objectContaining({ unitSpecValue: 1, unitSpecUnit: "kg" }),
    ], HEADER_AS_CHAIN);
  });

  it("shows an error if the draft can't be loaded", async () => {
    vi.mocked(fetchReceiptDraft).mockRejectedValue(new Error("Receipt not found"));

    renderReviewPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Receipt not found");
  });

  it("shows a duplicate warning and dismisses it on 'not a duplicate'", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(findDuplicateReceipt).mockResolvedValue({
      id: "receipt-old",
      uploadedAt: "2026-08-01T10:00:00Z",
    });

    renderReviewPage();

    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /not a duplicate/i }));

    expect(screen.queryByText(/possible duplicate/i)).not.toBeInTheDocument();
  });

  it("deletes the draft and navigates home when confirmed as a duplicate", async () => {
    vi.mocked(fetchReceiptDraft).mockResolvedValue(SAMPLE_DRAFT);
    vi.mocked(findDuplicateReceipt).mockResolvedValue({
      id: "receipt-old",
      uploadedAt: "2026-08-01T10:00:00Z",
    });
    vi.mocked(deleteReceipt).mockResolvedValue(undefined);

    renderReviewPage();
    await screen.findByText(/possible duplicate/i);
    await userEvent.click(screen.getByRole("button", { name: /it's a duplicate/i }));

    expect(deleteReceipt).toHaveBeenCalledWith("receipt-1");
    expect(await screen.findByText("Home stub")).toBeInTheDocument();
  });
});
