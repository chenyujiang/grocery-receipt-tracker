Type: grilling
Status: resolved

## Question

What does the page structure/information architecture look like, and how does the UI toggle between the two languages? (This isn't pixel-level visual design — it's pinning down the page list, navigation pattern, and bilingual display mechanism that the spec needs; exact visual styling is left for implementation or a later `/prototype` pass.)

## Answer

**Page list** (mobile-first, since the core action is photographing receipts on a phone):

- Home/Dashboard: this month's total spend, category breakdown, a summary of pending alerts (tickets 10/11), and the most recent receipts.
- Photo upload flow: take a photo / pick an image → AI processing → a preview/confirm screen (editing bilingual product name, quantity, spec, unit price, category, and match suggestion line by line, per tickets 03/05) → confirm to save.
- Receipt list: historical receipts, filterable by store/date/uploader.
- Product detail page: ticket 06's price trend chart + ticket 13's multi-store comparison module + ticket 07's consumption rate/estimated days remaining + the product's purchase history.
- Monthly report page: a month-scoped overview — this month's total spend and its change vs. last month, category breakdown, a price-change leaderboard (reusing ticket 06's calculation logic as a section on this page rather than a separate, duplicate page), the number of price-spike/low-stock alerts triggered this month (tickets 10/11), spending distribution by uploader, and a button to export data for the current time range (ticket 12, CSV format, no separate export page).
- Notification center: the alert list from tickets 10/11.
- Circle settings: member management, invite links (ticket 02).

**Navigation pattern**: a bottom tab bar (more natural for mobile web) — Home / Receipts / Monthly Report / Notifications / Me; photo upload is a prominent, centered floating action button rather than being tucked into one of the tabs.

**Bilingual content display mechanism**: a language toggle (placed on the "Me"/settings page, or at the top of the page) is added; by default only one language's version of dynamic content (`_zh`/`_en` fields like product names, store names) is shown, and switching it changes which language version is displayed across the board. The toggle only affects dynamic data content — it doesn't affect fixed UI chrome, which per ticket 09 is English-only regardless of this toggle.

**Scope note**: this ticket settles the page list, navigation structure, and the bilingual toggle mechanism — not pixel-level visual design (color coding is already settled in ticket 06 as red-up/green-down; fonts, spacing, and component styling are left for implementation/prototyping).
