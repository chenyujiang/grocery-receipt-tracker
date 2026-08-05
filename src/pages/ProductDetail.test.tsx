import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/productDetail is the boundary — its own Supabase behavior and the
// underlying math are already covered by productDetail.test.ts and the pure
// functions it composes; this only checks the page's UI behavior.
vi.mock("@/lib/productDetail", () => ({
  fetchProductDetail: vi.fn(),
}));

import { fetchProductDetail } from "@/lib/productDetail";
import ProductDetail from "@/pages/ProductDetail";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/products/product-1"]}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

const SAMPLE_DETAIL = {
  id: "product-1",
  canonicalNameEn: "Anchor Blue Milk",
  canonicalNameZh: "安科蓝带牛奶",
  category: "Food - Dairy & Bakery",
  priceChange: {
    changePercent: -20,
    baseline: { basis: "per_100g" as const, value: 1 },
    current: { basis: "per_100g" as const, value: 0.8 },
  },
  priceTrend: [
    { purchaseDate: "2026-07-01", basis: "per_100g" as const, value: 1, isPromotion: false },
    { purchaseDate: "2026-07-10", basis: "per_100g" as const, value: 0.8, isPromotion: false },
  ],
  storeComparison: [
    {
      storeNameEn: "Pak'nSave",
      storeNameZh: "帕克超市",
      basis: "per_100g" as const,
      value: 0.8,
      purchaseDate: "2026-07-10",
    },
    {
      storeNameEn: "Countdown",
      storeNameZh: "城内城外",
      basis: "per_100g" as const,
      value: 1,
      purchaseDate: "2026-07-01",
    },
  ],
  consumption: null,
  purchaseHistory: [
    {
      purchaseDate: "2026-07-01",
      storeNameEn: "Countdown",
      storeNameZh: "城内城外",
      unitPrice: 5.0,
      specValue: 500,
      specUnit: "g",
      isPromotion: false,
    },
  ],
};

describe("ProductDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the product's price change, store comparison, and purchase history", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue(SAMPLE_DETAIL);

    renderPage();

    expect(await screen.findByText(/Anchor Blue Milk/)).toBeInTheDocument();
    expect(fetchProductDetail).toHaveBeenCalledWith("product-1");
    expect(screen.getByText(/-20%/)).toBeInTheDocument();
    expect(screen.getByText(/Pak'nSave/)).toBeInTheDocument();
  });

  it("shows a fallback when there's no other-store comparison data", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      storeComparison: [SAMPLE_DETAIL.storeComparison[0]],
    });

    renderPage();

    expect(await screen.findByText(/no purchase records from other stores yet/i)).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchProductDetail).mockRejectedValue(new Error("network error"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
