import { NavLink } from "react-router-dom";

// Section 15: bottom tab bar — Home / Receipts / Monthly Report / Notifications / Me,
// with photo upload as a centered floating action button rather than a tab.
export default function BottomNav() {
  return (
    <>
      <NavLink to="/upload" className="fab" aria-label="拍照上传 Upload receipt">
        +
      </NavLink>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          首页
        </NavLink>
        <NavLink to="/receipts">小票</NavLink>
        <span className="bottom-nav-spacer" />
        <NavLink to="/report">月度报告</NavLink>
        <NavLink to="/notifications">通知</NavLink>
        <NavLink to="/settings">我的</NavLink>
      </nav>
    </>
  );
}
