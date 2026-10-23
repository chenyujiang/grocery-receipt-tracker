import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter, Routes, Route } from "react-router-dom";

// @/lib/productDetail is the boundary — its own Supabase behavior and the
// underlying math are already covered by productDetail.test.ts and the pure
// functions it composes; this only checks the page's UI behavior.
vi.mock("@/lib/productDetail", () => ({
  fetchProductDetail: vi.fn(),
}));

import { fetchProductDetail } from "@/lib/productDetail";
import ProductDetail, { SERIES_COLOURS } from "@/pages/ProductDetail";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "@/lib/LanguageProvider";

// Found from this file rather than the working directory, so the test runs
// the same from anywhere. (Vite's ?raw import would be neater, but Vitest
// stubs CSS out, so it comes back empty.)
const indexCss = readFileSync(join(__dirname, "../index.css"), "utf8");

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
    storeId: "store-paknsave",
    storeNameEn: "Pak'nSave",
    storeNameZh: "帕克超市",
  },
  priceTrend: [
    { storeId: "store-countdown", storeNameEn: "Countdown", storeNameZh: "城内城外", storeShortNameEn: "Countdown", storeShortNameZh: "城内城外", purchaseDate: "2026-07-01", basis: "per_100g" as const, value: 1, isPromotion: false },
    { storeId: "store-paknsave", storeNameEn: "Pak'nSave", storeNameZh: "帕克超市", storeShortNameEn: "Pak'nSave", storeShortNameZh: "帕克超市", purchaseDate: "2026-07-10", basis: "per_100g" as const, value: 0.8, isPromotion: false },
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
      receiptId: "receipt-1",
      storeId: "store-countdown",
      storeNameEn: "Countdown",
      storeNameZh: "城内城外",
      storeShortNameEn: "Countdown", storeShortNameZh: "城内城外",
      unitPrice: 5.0,
      quantity: 1,
      specValue: 500,
      specUnit: "g",
      isPromotion: false,
    },
  ],
};

const HORNBY = {
  storeId: "store-hornby",
  storeNameEn: "Woolworths Hornby",
  storeNameZh: "沃尔沃斯 霍恩比店",
  storeShortNameEn: "Hornby", storeShortNameZh: "霍恩比店",
};
const RICCARTON = {
  storeId: "store-riccarton",
  storeNameEn: "Woolworths Riccarton",
  storeNameZh: "沃尔沃斯 里卡顿店",
  storeShortNameEn: "Riccarton", storeShortNameZh: "里卡顿店",
};
const ALBANY = {
  storeId: "store-albany",
  storeNameEn: "PAK'nSAVE Albany",
  storeNameZh: "派克储蓄 奥尔巴尼店",
  storeShortNameEn: "Albany", storeShortNameZh: "奥尔巴尼店",
};
const WOOLWORTHS_UNKNOWN_BRANCH = {
  storeId: "store-woolworths",
  storeNameEn: "Woolworths",
  storeNameZh: "沃尔沃斯",
  storeShortNameEn: "Woolworths", storeShortNameZh: "沃尔沃斯",
};
const NO_STORE = {
  storeId: null,
  storeNameEn: "Some Supermarket",
  storeNameZh: "某超市",
  storeShortNameEn: "Some Supermarket", storeShortNameZh: "某超市",
};

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

  // Issue 29: the headline is one Store's Same-Store Price Change, so it says
  // which Store — otherwise "+10%" reads as the product's price everywhere.
  it("names the Store the headline price change is for", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceChange: {
        ...SAMPLE_DETAIL.priceChange,
        storeId: "store-hornby",
        storeNameEn: "Woolworths Hornby",
        storeNameZh: "沃尔沃斯 霍恩比",
      },
    });

    renderPage();

    const heading = await screen.findByRole("heading", { name: /price change/i });
    const headline = heading.closest("section")!;
    expect(within(headline).getByText(/Woolworths Hornby/)).toBeInTheDocument();
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

  // Spec Section 7: the chart's accessible name is UI chrome too.
  it("names the chart in the chosen language", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [trendPoint(HORNBY, "2026-07-01", 0.8), trendPoint(HORNBY, "2026-07-20", 0.85)],
    });
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    render(
      <MemoryRouter initialEntries={["/products/product-1"]}>
        <LanguageProvider>
          <Routes>
            <Route path="/products/:productId" element={<ProductDetail />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("img", { name: "价格走势" })).toBeInTheDocument();
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

  // A product bought only once still says where: its one purchase is a lone
  // point on the chart, named in the legend like any other Store's.
  it("draws a product's only purchase as a lone point, naming its Store in the legend", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [trendPoint(HORNBY, "2026-07-01", 0.8)],
    });

    renderPage();

    const chart = await screen.findByRole("img", { name: /price trend/i });
    expect(chart.querySelectorAll("polyline")).toHaveLength(0);
    expect(chart.querySelectorAll("circle")).toHaveLength(1);
    const legend = screen.getByRole("list", { name: /stores on the chart/i });
    expect(within(legend).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual(["Hornby"]);
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
    // Spec: the branch name alone, so the labels stay short on a phone.
    expect(entries.map((entry) => entry.textContent)).toEqual(["Hornby", "Riccarton"]);
    const lineColours = [...chart.querySelectorAll("polyline")].map((line) => line.getAttribute("stroke"));
    const dotColours = entries.map((entry) => entry.querySelector("circle")?.getAttribute("fill"));
    expect(dotColours).toEqual(lineColours);
  });

  it("names an unknown-branch Store in the legend by its chain", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [
        trendPoint(HORNBY, "2026-07-01", 0.8),
        trendPoint(WOOLWORTHS_UNKNOWN_BRANCH, "2026-07-05", 0.9),
        trendPoint(HORNBY, "2026-07-20", 0.85),
        trendPoint(WOOLWORTHS_UNKNOWN_BRANCH, "2026-07-25", 1),
      ],
    });

    renderPage();

    const legend = await screen.findByRole("list", { name: /stores on the chart/i });
    expect(within(legend).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      "Hornby",
      "Woolworths",
    ]);
  });

  // Two chains can have a branch of the same name; the branch alone would
  // then label two lines alike, with only the colour telling them apart.
  it("names a Store by chain and branch in the legend when another Store shares its branch name", async () => {
    const newWorldAlbany = {
      storeId: "store-new-world-albany",
      storeNameEn: "New World Albany",
      storeNameZh: "新世界 奥尔巴尼店",
      storeShortNameEn: "Albany", storeShortNameZh: "奥尔巴尼店",
    };
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      priceTrend: [
        trendPoint(ALBANY, "2026-07-01", 0.8),
        trendPoint(newWorldAlbany, "2026-07-05", 0.9),
        trendPoint(HORNBY, "2026-07-10", 0.85),
      ],
    });

    renderPage();

    const legend = await screen.findByRole("list", { name: /stores on the chart/i });
    expect(within(legend).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      "PAK'nSAVE Albany",
      "New World Albany",
      "Hornby",
    ]);
  });

  // The chart cycles through SERIES_COLOURS colours, so index.css must define
  // exactly that many, in every colour scheme alike — or a line goes
  // uncoloured, or a defined colour is never used.
  it("has index.css define exactly SERIES_COLOURS trend colours, in light and dark mode", () => {
    const css = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");
    // Each innermost rule that sets a trend colour — the light :root and the
    // dark override, wherever they sit — has to set all of them.
    const schemes = [...css.matchAll(/\{([^{}]*)\}/g)]
      .map((match) => match[1])
      .filter((body) => /--series-\d+\s*:/.test(body));
    expect(schemes.length).toBeGreaterThanOrEqual(2);
    const expected = Array.from({ length: SERIES_COLOURS }, (_, index) => `--series-${index + 1}`);
    for (const body of schemes) {
      expect([...body.matchAll(/(--series-\d+)\s*:/g)].map((match) => match[1])).toEqual(expected);
    }
  });

  it("shows a fallback when there's no other-store comparison data", async () => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      ...SAMPLE_DETAIL,
      storeComparison: [SAMPLE_DETAIL.storeComparison[0]],
    });

    renderPage();

    expect(await screen.findByText(/no purchase records from other stores yet/i)).toBeInTheDocument();
  });

  // Ticket 31: going from product A to B quickly must not let A's late
  // response overwrite B's page.
  it("shows the product it was switched to, even when the previous product's response lands last", async () => {
    let resolveA!: (detail: typeof SAMPLE_DETAIL) => void;
    let resolveB!: (detail: typeof SAMPLE_DETAIL) => void;
    vi.mocked(fetchProductDetail).mockImplementation((productId) =>
      new Promise((resolve) => {
        if (productId === "product-1") resolveA = resolve;
        else resolveB = resolve;
      })
    );

    render(
      <MemoryRouter initialEntries={["/products/product-1"]}>
        <Link to="/products/product-2">go to B</Link>
        <Routes>
          <Route path="/products/:productId" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("go to B"));
    expect(fetchProductDetail).toHaveBeenLastCalledWith("product-2");

    await act(async () => {
      resolveB({ ...SAMPLE_DETAIL, id: "product-2", canonicalNameEn: "Product B" });
    });
    await act(async () => {
      resolveA({ ...SAMPLE_DETAIL, canonicalNameEn: "Product A" });
    });

    expect(screen.getByText(/Product B/)).toBeInTheDocument();
    expect(screen.queryByText(/Product A/)).not.toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(fetchProductDetail).mockRejectedValue(new Error("network error"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("network error");
  });
});
