import { useState, type FormEvent } from "react";
import { signUpWithEmail } from "@/lib/auth";
import type { Role } from "@/types";

interface SignUpResult {
  userId: string;
  circleId: string;
  role: Role;
}

interface SignUpFormProps {
  onSuccess: (result: SignUpResult) => void;
}

export default function SignUpForm({ onSuccess }: SignUpFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signUpWithEmail(email, password);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Signing up…" : "Sign up"}
      </button>
    </form>
  );
}
