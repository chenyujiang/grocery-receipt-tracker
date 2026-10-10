import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    { storeId: "store-countdown", storeNameEn: "Countdown", storeNameZh: "城内城外", purchaseDate: "2026-07-01", basis: "per_100g" as const, value: 1, isPromotion: false },
    { storeId: "store-paknsave", storeNameEn: "Pak'nSave", storeNameZh: "帕克超市", purchaseDate: "2026-07-10", basis: "per_100g" as const, value: 0.8, isPromotion: false },
  ],
  storeComparison: [
    {
      storeId: "store-paknsave",
      storeNameEn: "Pak'nSave",
      storeNameZh: "帕克超市",
      basis: "per_100g" as const,
      value: 0.8,
      purchaseDate: "2026-07-10",
    },
    {
      storeId: "store-countdown",
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
      storeId: "store-countdown",
      storeNameEn: "Countdown",
      storeNameZh: "城内城外",
      unitPrice: 5.0,
      quantity: 1,
      specValue: 500,
      specUnit: "g",
      isPromotion: false,
    },
  ],
};

const HORNBY = { storeId: "store-hornby", storeNameEn: "Woolworths Hornby", storeNameZh: "沃尔沃斯 霍恩比店" };
const RICCARTON = {
  storeId: "store-riccarton",
  storeNameEn: "Woolworths Riccarton",
  storeNameZh: "沃尔沃斯 里卡顿店",
};
const ALBANY = { storeId: "store-albany", storeNameEn: "PAK'nSAVE Albany", storeNameZh: "派克储蓄 奥尔巴尼店" };
const NO_STORE = { storeId: null, storeNameEn: "Some Supermarket", storeNameZh: "某超市" };

function trendPoint(store: typeof NO_STORE | typeof HORNBY, purchaseDate: string, value: number) {
  return { ...store, purchaseDate, basis: "per_100g" as const, value, isPromotion: false };
}

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
    // The trend legend names Stores too, so look in the comparison itself.
    const comparison = screen.getByRole("heading", { name: /compare stores/i }).closest("section")!;
    expect(within(comparison).getByText(/Pak'nSave/)).toBeInTheDocument();
  });

  // Issue 29: one line per Store, so a branch drifting dearer than its
  // neighbour shows up as its own line rather than a zigzag between them.
  // A purchase with no Store belongs to no line, so it isn't drawn.
  it("draws the price trend as one line per Store, leaving out purchases with no Store", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [
        trendPoint(HORNBY, "2026-07-01", 0.8),
        trendPoint(RICCARTON, "2026-07-05", 0.9),
        trendPoint(NO_STORE, "2026-07-10", 0.5),
        trendPoint(HORNBY, "2026-07-20", 0.85),
        trendPoint(RICCARTON, "2026-07-25", 1),
      ],
    });

    renderPage();

    const chart = await screen.findByRole("img", { name: /price trend/i });
    const lines = [...chart.querySelectorAll("polyline")];
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((line) => line.getAttribute("stroke"))).size).toBe(2);
    expect(chart.querySelectorAll("circle")).toHaveLength(4);
  });

  it("draws a Store bought from only once as a lone point, not a line", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [
        trendPoint(HORNBY, "2026-07-01", 0.8),
        trendPoint(ALBANY, "2026-07-05", 0.7),
        trendPoint(HORNBY, "2026-07-20", 0.85),
      ],
    });

    renderPage();

    const chart = await screen.findByRole("img", { name: /price trend/i });
    expect(chart.querySelectorAll("polyline")).toHaveLength(1);
    expect(chart.querySelectorAll("circle")).toHaveLength(3);
  });

  it("names each line's Store in a legend under the chart, in that line's colour", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [
        trendPoint(HORNBY, "2026-07-01", 0.8),
        trendPoint(RICCARTON, "2026-07-05", 0.9),
        trendPoint(NO_STORE, "2026-07-10", 0.5),
        trendPoint(HORNBY, "2026-07-20", 0.85),
        trendPoint(RICCARTON, "2026-07-25", 1),
      ],
    });

    renderPage();

    const chart = await screen.findByRole("img", { name: /price trend/i });
    const legend = screen.getByRole("list", { name: /stores on the chart/i });
    const entries = within(legend).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Woolworths Hornby",
      "Woolworths Riccarton",
    ]);
    const lineColours = [...chart.querySelectorAll("polyline")].map((line) => line.getAttribute("stroke"));
    const dotColours = entries.map((entry) => entry.querySelector("circle")?.getAttribute("fill"));
    expect(dotColours).toEqual(lineColours);
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
