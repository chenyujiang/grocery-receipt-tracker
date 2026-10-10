import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchProductDetail, type ProductDetail as ProductDetailData } from "@/lib/productDetail";
import type { PriceTrendPoint } from "@/lib/priceTrend";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";
import { errorMessage } from "@/lib/errorMessage";

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

// How many --series-N colour tokens index.css defines; a fifth Store reuses
// the first colour.
const SERIES_COLOURS = 4;

// Small hand-rolled sparkline — the data is a handful of points per product,
// not worth pulling in a charting library for. Promotional points render
// hollow (Section 10's "distinct style" requirement for promo records).
// Issue 29: one line per Store, each in its own series colour; a purchase
// with no Store belongs to no line, so it isn't drawn.
function PriceTrendChart({ points: allPoints }: { points: PriceTrendPoint[] }) {
  const { language, t } = useLanguage();
  const points = allPoints.filter((point) => point.storeId !== null);
  if (points.length === 0) {
    return <p>{t("product.notEnoughData")}</p>;
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

  // Stores in order of first purchase, so a product's colours stay put as
  // newer purchases arrive.
  const storeIds = [...new Set(points.map((point) => point.storeId))];
  const colourOf = (storeId: string | null) =>
    `var(--series-${(storeIds.indexOf(storeId) % SERIES_COLOURS) + 1})`;

  // x is the purchase's place in the whole history, shared by every line.
  const coords = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y, point };
  });

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="price-trend-chart" role="img" aria-label="Price trend over time">
        {storeIds.map((storeId) => {
          const line = coords.filter((c) => c.point.storeId === storeId);
          // A Store bought from once is just its point — a one-point line would
          // be invisible anyway.
          if (line.length < 2) return null;
          return (
            <polyline
              key={storeId}
              points={line.map((c) => `${c.x},${c.y}`).join(" ")}
              fill="none"
              stroke={colourOf(storeId)}
              strokeWidth="2"
            />
          );
        })}
        {coords.map((c, index) => (
          <circle
            key={index}
            cx={c.x}
            cy={c.y}
            r={4}
            fill={c.point.isPromotion ? "var(--surface)" : colourOf(c.point.storeId)}
            stroke={colourOf(c.point.storeId)}
            strokeWidth="2"
          />
        ))}
      </svg>
      <ul className="price-trend-legend" aria-label={t("product.trendLegend")}>
        {storeIds.map((storeId) => {
          // Named as the Store's latest receipt prints it.
          const latest = [...points].reverse().find((point) => point.storeId === storeId)!;
          return (
            <li key={storeId}>
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="5" fill={colourOf(storeId)} />
              </svg>
              {pickText(latest.storeNameEn, latest.storeNameZh, language)}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function ProductDetail() {
  const { language, t } = useLanguage();
  const { productId } = useParams<{ productId: string }>();
  const [detail, setDetail] = useState<ProductDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    fetchProductDetail(productId)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err, "Failed to load product")));
  }, [productId]);

  return (
    <div className="page">
      <h1>{t("product.title")}</h1>

      {error && <p role="alert">{error}</p>}

      {!error && detail === null && <p>{t("common.loading")}</p>}

      {!error && detail !== null && (
        <>
          <p>
            {pickText(detail.canonicalNameEn, detail.canonicalNameZh, language)} ·{" "}
            {categoryLabel(detail.category, language)}
          </p>

          <section>
            <h2>{t("product.priceChange")}</h2>
            {detail.priceChange === null ? (
              <p>{t("product.notEnoughData")}</p>
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
            <h2>{t("product.priceTrend")}</h2>
            <PriceTrendChart points={detail.priceTrend} />
          </section>

          <section>
            <h2>{t("product.compareStores")}</h2>
            {detail.storeComparison.length < 2 ? (
              <p>{t("product.noOtherStores")}</p>
            ) : (
              <ul>
                {detail.storeComparison.map((entry) => (
                  <li key={entry.storeId}>
                    {pickText(entry.storeNameEn, entry.storeNameZh, language)} — $
                    {entry.value.toFixed(2)}
                    {PRICE_BASIS_LABEL[entry.basis]} ({entry.purchaseDate})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>{t("product.consumption")}</h2>
            {detail.consumption === null ? (
              <p>{t("product.notEnoughData")}</p>
            ) : (
              <p>
                {t("product.estimatedDaysRemaining", { days: detail.consumption.estimatedDaysRemaining })}{" "}
                ({detail.consumption.dailyRate} {QUANTITY_BASIS_LABEL[detail.consumption.basis]}/day —{" "}
                {t("product.consumptionNote")})
              </p>
            )}
          </section>

          <section>
            <h2>{t("product.purchaseHistory")}</h2>
            {detail.purchaseHistory.length === 0 ? (
              <p>{t("product.noPurchases")}</p>
            ) : (
              <ul>
                {detail.purchaseHistory.map((entry, index) => (
                  <li key={index}>
                    {entry.purchaseDate} · {pickText(entry.storeNameEn, entry.storeNameZh, language)}{" "}
                    — ${entry.unitPrice.toFixed(2)}
                    {entry.isPromotion && ` (${t("product.promo")})`}
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
