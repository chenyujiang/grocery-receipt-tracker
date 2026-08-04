Type: grilling
Status: resolved
Blocked by: 07

## Question

Exactly how should the low-stock reminder be displayed and delivered? (Ticket 07 already defines the trigger condition — estimated days remaining < 5 — this ticket needs to decide how the notification is presented to the user.)

Needs to cover:

- Notification channel — ticket 01 already decided on a "in-app display + email notification" weak-push approach for the web app; this ticket needs to decide exactly how that's presented (what the in-app alert list looks like, what an email contains).
- Reminder frequency — once estimated days remaining drops below 5, is the user notified once, or every day until they buy it or dismiss the alert.
- Who in the circle receives the reminder — all members, or only members who have historically bought this product.
- Whether this shares the same notification list/email template as ticket 10 ("price-spike alert rules"), or is displayed separately.

## Answer

**Check mechanism**: unlike ticket 10, the low-stock reminder can't hang off the "receipt confirmed" event, because estimated days remaining naturally decreases over time even with no new receipts. So a daily scheduled job (Vercel Cron or Supabase pg_cron) scans every standardized product (`product_id`) in each circle to check whether its estimated days remaining has newly dropped below the 5-day threshold.

**Reminder frequency**: each product keeps a "currently in low-stock alert state" flag (e.g. a `Product.low_stock_alert_active` boolean). When the threshold is first crossed, if this flag is still false, one reminder is sent and the flag is set to true; on subsequent days, the daily job sees the same product still below the threshold but with the flag already true, so it doesn't resend. Only once the user buys more and the estimated days remaining rises back above 5 does the flag reset to false, ready to trigger again the next time it's genuinely running low.

**Notification channel and audience**: reuses the in-app notification list and email template already established in ticket 10, just with a different message type (low-stock vs. price-spike) rather than building a separate UI. The audience is likewise all members of the circle, consistent with ticket 10.
