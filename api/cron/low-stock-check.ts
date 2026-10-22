import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { parseBearerToken } from "../_lib/bearerToken.js";
import { detectLowStock, type ProductConsumptionCheck } from "../../src/lib/lowStockAlerts.js";
import { fetchPurchaseHistories } from "../../src/lib/purchaseHistory.js";
import { POSTGREST_PAGE_SIZE } from "../../src/lib/postgrestPaging.js";
import type { Database } from "../../src/types/database.types.js";

// Section 12: unlike price-spike alerts (triggered on receipt confirm), the
// low-stock check has to run on a schedule, since estimated days remaining
// decreases over time even with no new receipts. Wired up via vercel.json's
// cron config to run once a day.
//
// Orchestration only: this pages through every Product, runs each page
// through load-history, detect and write-back, and sums what each page wrote.
// The detection logic lives in src/lib/lowStockAlerts.ts, already covered by
// its own tests.

type ProductRow = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "circle_id" | "low_stock_alert_active"
>;
type BatchOutcome = { newAlerts: number; recoveries: number } | { error: string };

async function checkBatch(productRows: ProductRow[]): Promise<BatchOutcome> {
  if (productRows.length === 0) {
    return { newAlerts: 0, recoveries: 0 };
  }

  let histories;
  try {
    // Service-role client: this deliberately reads across every Circle, because
    // the cron checks the whole database's Products.
    histories = await fetchPurchaseHistories(
      supabaseAdmin,
      productRows.map((product) => product.id)
    );
  } catch {
    return { error: "Failed to load purchase history" };
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

  let recorded = 0;
  if (newAlerts.length > 0) {
    // Ticket 36: inserting the Alerts and flagging their Products is one
    // transaction inside this function, so a failure leaves neither behind
    // and a re-run can't raise the same Alert twice. The function reads each
    // Product's Circle itself, rather than trusting one passed in.
    const { data: recordedCount, error: recordError } = await supabaseAdmin.rpc(
      "record_low_stock_alerts",
      { p_product_ids: newAlerts.map((alert) => alert.productId) }
    );
    if (recordError) {
      return { error: "Failed to record low-stock alerts" };
    }
    // What the function actually wrote, which is fewer than detected when a
    // Product was already flagged (a re-run, or an overlapping run).
    recorded = recordedCount ?? 0;
  }

  if (recoveries.length > 0) {
    const { error: recoverError } = await supabaseAdmin
      .from("products")
      .update({ low_stock_alert_active: false })
      .in("id", recoveries);
    if (recoverError) {
      return { error: "Failed to reset recovered products" };
    }
  }

  return { newAlerts: recorded, recoveries: recoveries.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Issue 19: this is the only route in api/ with no user session to check --
  // it reads and writes with the service-role client across every Circle, so
  // RLS doesn't contain it. Vercel Cron sends `Authorization: Bearer
  // $CRON_SECRET` when CRON_SECRET is set on the project, and that shared
  // secret is the whole of this route's access control.
  //
  // An unset CRON_SECRET fails closed. Treating "no secret configured" as
  // "skip the check" would leave the route wide open in exactly the
  // misconfigured deploy this is meant to protect.
  const cronSecret = process.env.CRON_SECRET;
  const presentedSecret = parseBearerToken(req.headers.authorization);
  if (!cronSecret || presentedSecret !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Ticket 36: one unpaginated read is capped by PostgREST's max-rows
  // (default 1000), so everything past it was silently never checked. Page
  // through Products over a stable order instead, and run each page through
  // the whole check-and-write cycle before reading the next, so neither the
  // history read nor the writes ever see more than one page's worth of ids.
  //
  // Keyset rather than offset paging: each page starts after the last id the
  // previous one ended on, so a Product inserted (or deleted) mid-run can't
  // shift a page boundary and get another Product checked twice or skipped.
  let totalNewAlerts = 0;
  let totalRecoveries = 0;
  let lastId: string | null = null;
  for (;;) {
    let query = supabaseAdmin
      .from("products")
      .select("id, circle_id, low_stock_alert_active")
      .order("id", { ascending: true })
      .limit(POSTGREST_PAGE_SIZE);
    if (lastId !== null) {
      query = query.gt("id", lastId);
    }
    const { data: products, error: productsError } = await query;
    if (productsError) {
      res.status(500).json({ error: "Failed to load products" });
      return;
    }

    const productRows = products ?? [];
    const outcome = await checkBatch(productRows);
    if ("error" in outcome) {
      res.status(500).json({ error: outcome.error });
      return;
    }
    totalNewAlerts += outcome.newAlerts;
    totalRecoveries += outcome.recoveries;

    // A short page is the last one. A full page may or may not be — the next
    // read finds out, at the cost of one empty page when the count is an
    // exact multiple of the page size.
    if (productRows.length < POSTGREST_PAGE_SIZE) {
      break;
    }
    lastId = productRows[productRows.length - 1].id;
  }

  res.status(200).json({ newAlerts: totalNewAlerts, recoveries: totalRecoveries });
}
