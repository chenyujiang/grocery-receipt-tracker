import { useParams } from "react-router-dom";

// Section 15, page 4: price trend chart (S10) + multi-store comparison (S11)
// + consumption rate / estimated days remaining (S12) + purchase history.
export default function ProductDetail() {
  const { productId } = useParams();
  return (
    <div className="page">
      <h1>商品详情 Product Detail</h1>
      <p>product_id: {productId}</p>
      <ul>
        <li>价格趋势图 Price trend chart（第 10 节）</li>
        <li>多店铺比价 Multi-store comparison（第 11 节）</li>
        <li>消耗速度 / 预计剩余天数 Consumption rate（第 12 节）</li>
        <li>购买历史 Purchase history</li>
      </ul>
    </div>
  );
}
