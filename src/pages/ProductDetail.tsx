import { useParams } from "react-router-dom";

// Section 15, page 4: price trend chart (S10) + multi-store comparison (S11)
// + consumption rate / estimated days remaining (S12) + purchase history.
export default function ProductDetail() {
  const { productId } = useParams();
  return (
    <div className="page">
      <h1>Product Detail</h1>
      <p>product_id: {productId}</p>
      <ul>
        <li>Price trend chart (Section 10)</li>
        <li>Multi-store comparison (Section 11)</li>
        <li>Consumption rate / estimated days remaining (Section 12)</li>
        <li>Purchase history</li>
      </ul>
    </div>
  );
}
