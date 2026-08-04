Type: grilling
Status: resolved

## Question

What exactly should data export / monthly reports look like? (The core data model is now fully defined across tickets 01-09, so this feature's details can now be pinned down.)

Needs to cover:

- Export format — CSV, Excel, or a readable monthly report page/PDF.
- Export scope — raw line-by-line purchase records, or aggregated statistics (monthly totals by category, by product).
- Export dimension — export for the whole circle, or filterable by individual (who bought it).
- Whether the monthly report is a standalone page (similar to the price-comparison page from ticket 06), or the exported file itself serves as the "report."

## Answer

**Export format**: CSV. No extra Excel-generation library needed; users can import it straight into Excel/Google Sheets for their own further analysis.

**Export content**: line-by-line detail — each `ReceiptItem` expands into one row, with fields for product name, category, quantity, spec, unit price, store, date, and uploader; nothing is pre-aggregated, so users can summarize it however they like in Excel.

**Export scope**: exports the whole circle's data by default; the user can pick a time range (e.g. the last month, or a custom start/end date); no filtering by uploader, keeping the export options simple.

**Monthly report page**: a standalone page is needed, pulling several already-defined calculations into one "monthly summary" view (selectable by month, with the ability to browse past months):

- This month's total spend, and the month-over-month change versus last month.
- Spending breakdown by category (using the category taxonomy from ticket 04).
- Price-change leaderboard — this reuses the calculation logic already defined in ticket 06, embedded as a section within the report rather than existing as a separate, duplicate page; the standalone "Price Stats" tab from ticket 14 now points to this monthly report page instead.
- The number of price-spike and low-stock alerts triggered this month (data from tickets 10/11).
- Spending distribution by uploader (`uploaded_by`), plus the total number of receipts and line items uploaded this month.

**Export entry point**: placed on this monthly report page as an "export data for the current time range" button, rather than opening a separate dedicated export page.
