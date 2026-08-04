import type { VercelRequest, VercelResponse } from "@vercel/node";

// Section 12: unlike price-spike alerts (triggered on receipt confirm), the
// low-stock check has to run on a schedule, since estimated days remaining
// decreases over time even with no new receipts. Wired up via vercel.json's
// cron config to run once a day.
//
// TODO: for every Product, compute the 5-purchase sliding-window consumption
// rate and estimated days remaining (skip products with < 3 purchases).
// TODO: when a product newly drops below the 5-day threshold and
// low_stock_alert_active is false, send the alert and set it to true.
// TODO: when estimated days remaining recovers above the threshold, reset
// low_stock_alert_active to false.

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(501).json({ error: "Not implemented — scaffold only" });
}
