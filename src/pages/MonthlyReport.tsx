// Section 14 + 15, page 5: month-scoped overview — total spend vs last month,
// category breakdown, the price-change leaderboard (reusing Section 10),
// alert counts, per-uploader spending, and the CSV export button.
export default function MonthlyReport() {
  return (
    <div className="page">
      <h1>月度报告 Monthly Report</h1>
      <ul>
        <li>本月总支出及环比 Total spend vs. last month</li>
        <li>分类占比 Category breakdown</li>
        <li>涨幅榜单 Price-change leaderboard</li>
        <li>本月提醒次数 Alerts triggered this month</li>
        <li>按人支出分布 Spending by uploader</li>
      </ul>
      <button type="button">导出 CSV Export CSV</button>
    </div>
  );
}
