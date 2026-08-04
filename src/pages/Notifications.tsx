// Section 13 + 15, page 6: price-spike and low-stock alert list (shared UI, ticket 11).
export default function Notifications() {
  return (
    <div className="page">
      <h1>通知中心 Notifications</h1>
      <p>价格异常提醒（涨幅 &gt; 15%）+ 库存快用完提醒。</p>
    </div>
  );
}
