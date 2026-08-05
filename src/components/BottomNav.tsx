import { NavLink } from "react-router-dom";
import { useLanguage } from "@/lib/LanguageProvider";

// Minimal 22px line icons, hand-authored to avoid pulling in an icon library
// for six glyphs. Purely decorative — the visible label carries meaning.
function IconProps() {
  return { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

function HomeIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

function ReceiptsIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <rect x="4" y="12" width="3.5" height="8" />
      <rect x="10.25" y="6" width="3.5" height="14" />
      <rect x="16.5" y="9" width="3.5" height="11" />
    </svg>
  );
}

function NotificationsIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.5 5.5 1.5 5.5H4.5S6 14.5 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MeIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-4 4.6-6 7.5-6s6.1 2 7.5 6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg {...IconProps()} aria-hidden="true">
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16" />
    </svg>
  );
}

// Section 15: bottom tab bar — Home / Receipts / Upload / Report / Me, five
// even items. Notifications lives as a separate icon pinned to the top-right
// corner instead of crowding a sixth item into the row.
export default function BottomNav() {
  const { t } = useLanguage();

  return (
    <>
      <NavLink to="/notifications" className="top-notifications" aria-label={t("nav.notifications")}>
        <NotificationsIcon />
      </NavLink>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          <HomeIcon />
          {t("nav.home")}
        </NavLink>
        <NavLink to="/receipts">
          <ReceiptsIcon />
          {t("nav.receipts")}
        </NavLink>
        <NavLink to="/upload">
          <UploadIcon />
          {t("nav.upload")}
        </NavLink>
        <NavLink to="/report">
          <ReportIcon />
          {t("nav.report")}
        </NavLink>
        <NavLink to="/settings">
          <MeIcon />
          {t("nav.me")}
        </NavLink>
      </nav>
    </>
  );
}
