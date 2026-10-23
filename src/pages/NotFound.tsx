import { useLanguage } from "@/lib/LanguageProvider";

// Issue 15 decision 2: also what a non-admin sees at the hidden admin
// route — a plain 404, not a login redirect, so the route's existence
// isn't confirmed to anyone probing it.
export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
    </div>
  );
}
