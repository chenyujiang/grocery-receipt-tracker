// Section 14 + 15, page 5: month-scoped overview — total spend vs last month,
// category breakdown, the price-change leaderboard (reusing Section 10),
// alert counts, per-uploader spending, and the CSV export button.
export default function MonthlyReport() {
  return (
    <div className="page">
      <h1>Monthly Report</h1>
      <ul>
        <li>Total spend vs. last month</li>
        <li>Category breakdown</li>
        <li>Price-change leaderboard</li>
        <li>Alerts triggered this month</li>
        <li>Spending by uploader</li>
      </ul>
      <button type="button">Export CSV</button>
    </div>
  );
}
