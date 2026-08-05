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
import AdminDashboard from "@/pages/AdminDashboard";
import RequireGlobalAdmin from "@/components/RequireGlobalAdmin";
import { ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";

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
      {/* Section 16 / issue 15 decision 8: standalone, not wrapped in
          AppShell/bottom nav — a non-obvious path guarded by
          RequireGlobalAdmin, which 404s (not a login redirect) for
          anyone who isn't the global admin. */}
      <Route
        path={ADMIN_DASHBOARD_PATH}
        element={
          <RequireGlobalAdmin>
            <AdminDashboard />
          </RequireGlobalAdmin>
        }
      />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
