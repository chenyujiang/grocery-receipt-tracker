import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAlerts, type AlertListItem } from "@/lib/alerts";

// Section 13 + 15, page 6: price-spike and low-stock alert list (shared UI, ticket 11).
export default function Notifications() {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load alerts"));
  }, []);

  return (
    <div className="page">
      <h1>通知中心 Notifications</h1>
      <p>价格异常提醒（涨幅 &gt; 15%）+ 库存快用完提醒。</p>

      {error && <p role="alert">{error}</p>}

      {!error && alerts === null && <p>加载中… Loading…</p>}

      {!error && alerts !== null && alerts.length === 0 && (
        <p>暂无提醒 No alerts yet.</p>
      )}

      {!error && alerts !== null && alerts.length > 0 && (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link to={`/products/${alert.productId}`}>
                {alert.productNameZh} {alert.productNameEn}
              </Link>
              {alert.type === "price_spike" ? (
                <span>
                  {" "}
                  · 涨幅 {alert.changePercent}% · 新价格 ${alert.newPrice}
                </span>
              ) : (
                <span> · 库存快用完 Low stock</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
