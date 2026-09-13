import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { detectLowStock, type ProductConsumptionCheck } from "../../src/lib/lowStockAlerts.js";
import { fetchPurchaseHistories } from "../../src/lib/purchaseHistory.js";

// Section 12: unlike price-spike alerts (triggered on receipt confirm), the
// low-stock check has to run on a schedule, since estimated days remaining
// decreases over time even with no new receipts. Wired up via vercel.json's
// cron config to run once a day.
//
// Thin orchestration only — the detection logic lives in
// src/lib/lowStockAlerts.ts, already covered by its own tests.

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, circle_id, low_stock_alert_active");
  if (productsError) {
    res.status(500).json({ error: "Failed to load products" });
    return;
  }

  const productRows = products ?? [];
  let histories;
  try {
    // Service-role client: this deliberately reads across every Circle, because
    // the cron checks the whole database's Products in one pass.
    histories = await fetchPurchaseHistories(
      supabaseAdmin,
      productRows.map((product) => product.id)
    );
  } catch {
    res.status(500).json({ error: "Failed to load purchase history" });
    return;
  }
  const purchasesByProduct = new Map(
    histories.map((history) => [history.productId, history.purchases])
  );

  const checks: Array<ProductConsumptionCheck & { circleId: string }> = productRows.map(
    (product) => ({
      productId: product.id,
      circleId: product.circle_id,
      lowStockAlertActive: product.low_stock_alert_active,
      purchases: purchasesByProduct.get(product.id) ?? [],
    })
  );

  const { newAlerts, recoveries } = detectLowStock(checks, new Date());

  if (newAlerts.length > 0) {
    // Every alert comes from a check that was built from productRows, so the
    // Circle is always known — look it up by id rather than scanning, and let
    // a genuinely missing one throw instead of inserting a null circle_id.
    const circleIdByProduct = new Map(checks.map((check) => [check.productId, check.circleId]));
    const alertRows = newAlerts.map((alert) => {
      const circleId = circleIdByProduct.get(alert.productId);
      if (circleId == null) {
        throw new Error(`low-stock alert for unknown product ${alert.productId}`);
      }
      return {
        circle_id: circleId,
        type: "low_stock" as const,
        product_id: alert.productId,
      };
    });

    const { error: insertError } = await supabaseAdmin.from("alerts").insert(alertRows);
    if (insertError) {
      res.status(500).json({ error: "Failed to record low-stock alerts" });
      return;
    }

    const { error: activateError } = await supabaseAdmin
      .from("products")
      .update({ low_stock_alert_active: true })
      .in(
        "id",
        newAlerts.map((alert) => alert.productId)
      );
    if (activateError) {
      res.status(500).json({ error: "Failed to flag products as low stock" });
      return;
    }
  }

  if (recoveries.length > 0) {
    const { error: recoverError } = await supabaseAdmin
      .from("products")
      .update({ low_stock_alert_active: false })
      .in("id", recoveries);
    if (recoverError) {
      res.status(500).json({ error: "Failed to reset recovered products" });
      return;
    }
  }

  res.status(200).json({ newAlerts: newAlerts.length, recoveries: recoveries.length });
}
