import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SignInForm from "@/components/SignInForm";
import SignUpForm from "@/components/SignUpForm";
import { useLanguage } from "@/lib/LanguageProvider";

// Thin composition layer — no logic of its own, so no dedicated test;
// the behavior lives in SignInForm/SignUpForm and src/lib/auth.ts.
export default function Auth() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const navigate = useNavigate();

  return (
    <div className="page auth-page">
      <h1>{mode === "signin" ? t("auth.signIn") : t("auth.signUp")}</h1>
      {mode === "signin" ? (
        <SignInForm onSuccess={() => navigate("/")} />
      ) : (
        <SignUpForm onSuccess={() => navigate("/")} />
      )}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? t("auth.signUpInstead") : t("auth.signInInstead")}
      </button>
    </div>
  );
}
