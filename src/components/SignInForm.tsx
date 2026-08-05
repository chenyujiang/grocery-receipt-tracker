import { useState, type FormEvent } from "react";
import { signInWithEmail } from "@/lib/auth";
import { useLanguage } from "@/lib/LanguageProvider";

interface SignInResult {
  userId: string;
  accessToken: string;
}

interface SignInFormProps {
  onSuccess: (result: SignInResult) => void;
}

export default function SignInForm({ onSuccess }: SignInFormProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signInWithEmail(email, password);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("auth.email")}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        {t("auth.password")}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? t("auth.signingIn") : t("auth.signIn.submit")}
      </button>
    </form>
  );
}
