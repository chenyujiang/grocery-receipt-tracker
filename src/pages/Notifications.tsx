import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAlerts, type AlertListItem } from "@/lib/alerts";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText } from "@/lib/bilingual";

// Section 13 + 15, page 6: price-spike and low-stock alert list (shared UI, ticket 11).
export default function Notifications() {
  const { language, t } = useLanguage();
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load alerts"));
  }, []);

  return (
    <div className="page">
      <h1>{t("notifications.title")}</h1>
      <p>{t("notifications.subtitle")}</p>

      {error && <p role="alert">{error}</p>}

      {!error && alerts === null && <p>{t("common.loading")}</p>}

      {!error && alerts !== null && alerts.length === 0 && <p>{t("notifications.none")}</p>}

      {!error && alerts !== null && alerts.length > 0 && (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link to={`/products/${alert.productId}`}>
                {pickText(alert.productNameEn, alert.productNameZh, language)}
              </Link>
              {alert.type === "price_spike" ? (
                <span>
                  {" "}
                  · +{alert.changePercent}% · {t("notifications.newPrice")} ${alert.newPrice}
                </span>
              ) : (
                <span> · {t("notifications.lowStock")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
