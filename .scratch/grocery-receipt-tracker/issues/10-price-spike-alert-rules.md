Type: grilling
Status: resolved
Blocked by: 06

## Question

What exactly triggers a price-spike alert? (Ticket 06 already defines the price-change formula; this ticket needs to decide "how much of a change counts as abnormal" and how the user is notified.)

Needs to cover:

- Whether the trigger threshold is a fixed percentage (e.g. more than a 15% increase), or can vary by category or be user-configurable.
- Trigger frequency — checked immediately after each receipt is confirmed, or checked in a monthly batch.
- Notification channel — ticket 01 already decided on a "in-app display + email notification" weak-push approach for the web app; this ticket needs to decide exactly how that's presented (an in-app alert list, what an email contains).
- Whether users can mute alerts for a specific product (e.g. they already know a product is expensive and don't want repeated alerts).

## Answer

**Trigger threshold**: a fixed percentage — triggers when the increase exceeds 15% (a single default for now, not varied by category; this can be made an adjustable setting later during development, no need to build that now).

**Check timing**: immediately after the user confirms a receipt (the `status = confirmed` step from ticket 03), the price-change calculation from ticket 06 is run for each product on that receipt, checking in real time whether the threshold is triggered.

**Who receives it**: all members of the circle see the alert, without filtering by "who has historically bought this product" — spending within a circle is shared by design, so this stays simple and consistent with ticket 02's permission model, where members can see all of the circle's records.

**In-app display**: an "alerts" list (like a notification center); each entry shows the triggered product's name (bilingual), the new price, the percentage increase, and a link to that product's price trend chart.

**Email notification**: rather than sending a separate email for every trigger, alerts are batched per receipt — after a receipt is confirmed, if multiple products on it triggered a price spike, they're combined into a single email sent to all circle members, listing every triggered product from that receipt, avoiding an inbox flooded with one-off emails.

**Mute functionality**: not built for now. Per-product alert muting isn't supported in this pass, keeping the MVP simple; it can be added later if users find the alerts too noisy.
