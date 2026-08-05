import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SignInForm from "@/components/SignInForm";
import SignUpForm from "@/components/SignUpForm";
import { useLanguage } from "@/lib/LanguageProvider";
import { isGlobalAdmin, ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";

// Thin composition layer — no logic of its own beyond the post-login
// admin redirect (issue 15 decision 8: a global admin lands on the admin
// dashboard once, right after login; everyone else goes to "/" as before).
export default function Auth() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const navigate = useNavigate();

  async function handleAuthSuccess(result: { userId: string }) {
    const admin = await isGlobalAdmin(result.userId).catch(() => false);
    navigate(admin ? ADMIN_DASHBOARD_PATH : "/");
  }

  return (
    <div className="page auth-page">
      <h1>{mode === "signin" ? t("auth.signIn") : t("auth.signUp")}</h1>
      {mode === "signin" ? (
        <SignInForm onSuccess={handleAuthSuccess} />
      ) : (
        <SignUpForm onSuccess={handleAuthSuccess} />
      )}
      <button
        type="button"
        className="btn-secondary btn-block"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? t("auth.signUpInstead") : t("auth.signInInstead")}
      </button>
    </div>
  );
}
