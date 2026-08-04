import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
import { detectLowStock, type ProductConsumptionCheck } from "../../src/lib/lowStockAlerts";

// Section 12: unlike price-spike alerts (triggered on receipt confirm), the
// low-stock check has to run on a schedule, since estimated days remaining
// decreases over time even with no new receipts. Wired up via vercel.json's
// cron config to run once a day.
//
// Thin orchestration only — the detection logic lives in
// src/lib/lowStockAlerts.ts, already covered by its own tests.

interface ReceiptItemHistoryRow {
  quantity: number;
  unit_spec_value: number | null;
  unit_spec_unit: string | null;
  receipts: { purchase_date: string };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, circle_id, low_stock_alert_active");
  if (productsError) {
    res.status(500).json({ error: "Failed to load products" });
    return;
  }

  const checks: Array<ProductConsumptionCheck & { circleId: string }> = [];
  for (const product of products ?? []) {
    const { data: rows, error } = await supabaseAdmin
      .from("receipt_items")
      .select("quantity, unit_spec_value, unit_spec_unit, receipts!inner(purchase_date, status)")
      .eq("product_id", product.id)
      .eq("receipts.status", "confirmed")
      .order("purchase_date", { foreignTable: "receipts", ascending: true });
    if (error) {
      res.status(500).json({ error: "Failed to load purchase history" });
      return;
    }

    const purchases = ((rows ?? []) as unknown as ReceiptItemHistoryRow[])
      .filter((row) => row.unit_spec_value != null && row.unit_spec_unit)
      .map((row) => ({
        purchaseDate: row.receipts.purchase_date,
        quantity: row.quantity,
        specValue: row.unit_spec_value as number,
        specUnit: row.unit_spec_unit as string,
      }));

    checks.push({
      productId: product.id,
      circleId: product.circle_id,
      lowStockAlertActive: product.low_stock_alert_active,
      purchases,
    });
  }

  const { newAlerts, recoveries } = detectLowStock(checks, new Date());

  if (newAlerts.length > 0) {
    const alertRows = newAlerts.map((alert) => {
      const check = checks.find((c) => c.productId === alert.productId);
      return {
        circle_id: check?.circleId,
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
