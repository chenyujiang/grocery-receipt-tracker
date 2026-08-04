import { NavLink } from "react-router-dom";

// Section 15: bottom tab bar — Home / Receipts / Monthly Report / Notifications / Me,
// with photo upload as a centered floating action button rather than a tab.
export default function BottomNav() {
  return (
    <>
      <NavLink to="/upload" className="fab" aria-label="Upload receipt">
        +
      </NavLink>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/receipts">Receipts</NavLink>
        <span className="bottom-nav-spacer" />
        <NavLink to="/report">Report</NavLink>
        <NavLink to="/notifications">Notifications</NavLink>
        <NavLink to="/settings">Me</NavLink>
      </nav>
    </>
  );
}
