import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SignInForm from "@/components/SignInForm";
import SignUpForm from "@/components/SignUpForm";

// Thin composition layer — no logic of its own, so no dedicated test;
// the behavior lives in SignInForm/SignUpForm and src/lib/auth.ts.
export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const navigate = useNavigate();

  return (
    <div className="page">
      <h1>{mode === "signin" ? "登录 Sign In" : "注册 Sign Up"}</h1>
      {mode === "signin" ? (
        <SignInForm onSuccess={() => navigate("/")} />
      ) : (
        <SignUpForm onSuccess={() => navigate("/")} />
      )}
      <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "还没有账号？注册 Sign up instead" : "已有账号？登录 Sign in instead"}
      </button>
    </div>
  );
}
