Type: grilling
Status: resolved
Blocked by: 05

## Question

How should consumption rate be calculated, and what should trigger a low-stock reminder?

Needs deciding:

- Whether consumption rate is estimated as "days between purchases ÷ quantity/spec per purchase" (e.g. buying a 5L bottle of oil every 45 days on average works out to roughly 111ml/day), or whether extra user input is needed (e.g. household size, whether they stockpile).
- How to avoid distorted calculations when purchase intervals are irregular (e.g. buying 3 bottles at once).
- What the trigger condition for a low-stock reminder should be (e.g. reminding when the estimated days remaining falls below N).
- Since the "current stock" the reminder relies on is an estimate rather than a real inventory count, how to communicate to the user that this is a prediction, not an exact figure.

The output should be the consumption-rate calculation model and the reminder trigger rules.

## Answer

**Calculation window**: for a given `product_id`, take the most recent 5 purchase records (or all available records if fewer than 5) as a sliding window, and compute average daily consumption as "total quantity purchased within the window ÷ total days spanned by the window," rather than looking only at the most recent purchase interval — this way stockpiling (buying several bottles at once) doesn't throw off the estimate.

- Weight/volume products are converted to the base units already established in ticket 06 (g / ml) before summing; count-based products are summed directly by quantity, with no conversion needed.
- The window's span is the number of days from the earliest to the most recent purchase date within the window; if multiple purchases fall on the same day, causing a span of 0, it's treated as 1 day to avoid dividing by zero.

**Handling insufficient data**: if a standardized product has fewer than 3 accumulated purchase records, no estimate or reminder is generated — the page shows "not enough data yet to predict"; normal estimation and reminders begin once 3 records are reached.

**Trigger condition for the low-stock reminder**:

- Estimated current remaining stock = the most recent purchase's quantity (in base units) − average daily consumption rate × (days since the most recent purchase date).
- Estimated days remaining = estimated current remaining stock ÷ average daily consumption rate; a reminder is triggered when this falls below 5 days (a default threshold for now — it can be made a user-adjustable setting later during development, no need to build that configurability now).

**Accuracy and automation**: the estimate is derived entirely from purchase records, with no manual "mark as used up / not used up" input, to avoid adding to the user's workload. The UI clearly labels these as "estimated" figures (e.g. "approx. 3 days of stock left") and notes that they're based on recent purchase history, so users understand this is a prediction, not an exact inventory count.
