import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchHomeSummary, type HomeSummary } from "@/lib/home";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";

// Section 15, page 1: Home/Dashboard — this month's total spend, category
// breakdown, a pending-alerts summary, and recent receipts.
export default function Home() {
  const { language, t } = useLanguage();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHomeSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load summary"));
  }, []);

  return (
    <div className="page">
      <h1>{t("home.title")}</h1>

      {error && <p role="alert">{error}</p>}

      {!error && summary === null && <p>{t("common.loading")}</p>}

      {!error && summary !== null && (
        <>
          <section>
            <h2>{t("home.thisMonth")}</h2>
            <p className="home-month-total">${summary.monthTotal.toFixed(2)}</p>
          </section>

          <section>
            <h2>{t("home.byCategory")}</h2>
            {summary.categoryBreakdown.length === 0 ? (
              <p>{t("home.noData")}</p>
            ) : (
              <ul>
                {summary.categoryBreakdown.map((entry) => (
                  <li key={entry.category}>
                    {categoryLabel(entry.category, language)} — ${entry.total.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>{t("home.alerts")}</h2>
            <p>
              <Link to="/notifications">
                {summary.pendingAlertsCount} {t("home.pendingAlerts")}
              </Link>
            </p>
          </section>

          <section>
            <h2>{t("home.recentReceipts")}</h2>
            {summary.recentReceipts.length === 0 ? (
              <p>{t("home.noReceipts")}</p>
            ) : (
              <ul>
                {summary.recentReceipts.map((receipt) => (
                  <li key={receipt.id}>
                    {receipt.purchaseDate} · {pickText(receipt.storeNameEn, receipt.storeNameZh, language)}{" "}
                    — ${receipt.totalAmount.toFixed(2)}
                    {receipt.status === "pending_review" && (
                      <>
                        {" "}
                        · <Link to={`/receipts/${receipt.id}/review`}>{t("home.needsReview")}</Link>
                      </>
                    )}
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
