import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchHomeSummary, type HomeSummary } from "@/lib/home";

// Section 15, page 1: Home/Dashboard — this month's total spend, category
// breakdown, a pending-alerts summary, and recent receipts.
export default function Home() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHomeSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load summary"));
  }, []);

  return (
    <div className="page">
      <h1>Home</h1>

      {error && <p role="alert">{error}</p>}

      {!error && summary === null && <p>Loading…</p>}

      {!error && summary !== null && (
        <>
          <section>
            <h2>This month</h2>
            <p className="home-month-total">${summary.monthTotal.toFixed(2)}</p>
          </section>

          <section>
            <h2>By category</h2>
            {summary.categoryBreakdown.length === 0 ? (
              <p>No data yet.</p>
            ) : (
              <ul>
                {summary.categoryBreakdown.map((entry) => (
                  <li key={entry.category}>
                    {entry.category} — ${entry.total.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Alerts</h2>
            <p>
              <Link to="/notifications">{summary.pendingAlertsCount} pending alerts</Link>
            </p>
          </section>

          <section>
            <h2>Recent receipts</h2>
            {summary.recentReceipts.length === 0 ? (
              <p>No receipts yet.</p>
            ) : (
              <ul>
                {summary.recentReceipts.map((receipt) => (
                  <li key={receipt.id}>
                    {receipt.purchaseDate} · {receipt.storeNameZh} {receipt.storeNameEn} — $
                    {receipt.totalAmount.toFixed(2)}
                    {receipt.status === "pending_review" && (
                      <>
                        {" "}
                        · <Link to={`/receipts/${receipt.id}/review`}>Needs review</Link>
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
