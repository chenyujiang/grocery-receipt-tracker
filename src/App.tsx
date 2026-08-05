import { Routes, Route } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import RequireAuth from "@/components/RequireAuth";
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";
import ReceiptUpload from "@/pages/ReceiptUpload";
import ReceiptReview from "@/pages/ReceiptReview";
import ReceiptDetail from "@/pages/ReceiptDetail";
import ReceiptList from "@/pages/ReceiptList";
import ProductDetail from "@/pages/ProductDetail";
import MonthlyReport from "@/pages/MonthlyReport";
import Notifications from "@/pages/Notifications";
import CircleSettings from "@/pages/CircleSettings";

// Everything except /auth requires a signed-in session and shows the bottom
// nav; /auth renders standalone (no nav, nothing to navigate to yet).
function AppShell() {
  return (
    <RequireAuth>
      <div className="app-shell">
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<ReceiptUpload />} />
            <Route path="/receipts/:receiptId/review" element={<ReceiptReview />} />
            <Route path="/receipts/:receiptId" element={<ReceiptDetail />} />
            <Route path="/receipts" element={<ReceiptList />} />
            <Route path="/products/:productId" element={<ProductDetail />} />
            <Route path="/report" element={<MonthlyReport />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<CircleSettings />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </RequireAuth>
  );
}

// Route structure mirrors spec.md Section 15's page list.
export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
