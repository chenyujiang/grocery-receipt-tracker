import { useState } from "react";
import { signOut } from "@/lib/auth";

// Section 4 + 15, page 7: member management and invite links.
export default function CircleSettings() {
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      // No manual navigation needed — AuthProvider's onAuthStateChange
      // updates the session to null, and RequireAuth redirects to /auth.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="page">
      <h1>Circle Settings</h1>
      <p>Member management, invite links, language toggle (Section 7).</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="btn-secondary" onClick={handleSignOut} disabled={signingOut}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
