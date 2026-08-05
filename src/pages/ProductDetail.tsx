import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchProductDetail, type ProductDetail as ProductDetailData } from "@/lib/productDetail";
import type { PriceTrendPoint } from "@/lib/priceTrend";

const PRICE_BASIS_LABEL: Record<string, string> = {
  per_100g: "/100g",
  per_100ml: "/100ml",
  each: "/each",
};

const QUANTITY_BASIS_LABEL: Record<string, string> = {
  g: "g",
  ml: "ml",
  each: "items",
};

// Small hand-rolled sparkline — the data is a handful of points per product,
// not worth pulling in a charting library for. Promotional points render
// hollow (Section 10's "distinct style" requirement for promo records).
function PriceTrendChart({ points }: { points: PriceTrendPoint[] }) {
  if (points.length === 0) {
    return <p>Not enough data yet.</p>;
  }
  if (points.length === 1) {
    return (
      <p>
        ${points[0].value.toFixed(2)} {PRICE_BASIS_LABEL[points[0].basis]} ({points[0].purchaseDate})
      </p>
    );
  }

  const width = 300;
  const height = 100;
  const padding = 10;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y, point };
  });

  const linePath = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="price-trend-chart" role="img" aria-label="Price trend over time">
      <polyline points={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" />
      {coords.map((c, index) => (
        <circle
          key={index}
          cx={c.x}
          cy={c.y}
          r={4}
          fill={c.point.isPromotion ? "var(--surface)" : "var(--primary)"}
          stroke="var(--primary)"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const [detail, setDetail] = useState<ProductDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    fetchProductDetail(productId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load product"));
  }, [productId]);

  return (
    <div className="page">
      <h1>Product Detail</h1>

      {error && <p role="alert">{error}</p>}

      {!error && detail === null && <p>Loading…</p>}

      {!error && detail !== null && (
        <>
          <p>
            {detail.canonicalNameZh} {detail.canonicalNameEn} · {detail.category}
          </p>

          <section>
            <h2>Price change</h2>
            {detail.priceChange === null ? (
              <p>Not enough data yet.</p>
            ) : (
              <p
                className={
                  detail.priceChange.changePercent > 0 ? "price-up" : "price-down"
                }
              >
                {detail.priceChange.changePercent > 0 ? "+" : ""}
                {detail.priceChange.changePercent}% — now ${detail.priceChange.current.value.toFixed(2)}
                {PRICE_BASIS_LABEL[detail.priceChange.current.basis]}
              </p>
            )}
          </section>

          <section>
            <h2>Price trend</h2>
            <PriceTrendChart points={detail.priceTrend} />
          </section>

          <section>
            <h2>Compare stores</h2>
            {detail.storeComparison.length < 2 ? (
              <p>No purchase records from other stores yet.</p>
            ) : (
              <ul>
                {detail.storeComparison.map((entry) => (
                  <li key={entry.storeNameEn}>
                    {entry.storeNameZh} {entry.storeNameEn} — ${entry.value.toFixed(2)}
                    {PRICE_BASIS_LABEL[entry.basis]} ({entry.purchaseDate})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Consumption</h2>
            {detail.consumption === null ? (
              <p>Not enough data yet.</p>
            ) : (
              <p>
                Estimated {detail.consumption.estimatedDaysRemaining} days remaining ({" "}
                {detail.consumption.dailyRate} {QUANTITY_BASIS_LABEL[detail.consumption.basis]}/day —
                estimated, not an exact count)
              </p>
            )}
          </section>

          <section>
            <h2>Purchase history</h2>
            {detail.purchaseHistory.length === 0 ? (
              <p>No purchases yet.</p>
            ) : (
              <ul>
                {detail.purchaseHistory.map((entry, index) => (
                  <li key={index}>
                    {entry.purchaseDate} · {entry.storeNameZh} {entry.storeNameEn} — $
                    {entry.unitPrice.toFixed(2)}
                    {entry.isPromotion && " (promo)"}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
