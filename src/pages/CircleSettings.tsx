import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText } from "@/lib/bilingual";
import { signOut } from "@/lib/auth";
import { fetchCircleMembers, type CircleMember } from "@/lib/circleMembers";
import { updateOwnDisplayName, removeMember, dissolveCircle } from "@/lib/circleActions";

const DISSOLVE_CONFIRM_TEXT = "DISSOLVE";

// Section 4 + 15, page 7: member management. Invite links need an
// email-sending service the app doesn't have yet (spec.md Section 4), so
// joining a circle is still owner-at-signup only — see README.
export default function CircleSettings() {
  const { session } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [members, setMembers] = useState<CircleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const [dissolveConfirmInput, setDissolveConfirmInput] = useState("");
  const [dissolving, setDissolving] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  function load() {
    setError(null);
    fetchCircleMembers()
      .then((loaded) => {
        setMembers(loaded);
        const self = loaded.find((member) => member.userId === session?.userId);
        if (self) {
          setDisplayNameInput(self.displayName);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load members"));
  }

  useEffect(load, [session?.userId]);

  const self = members?.find((member) => member.userId === session?.userId) ?? null;
  const isOwner = self?.role === "owner";

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    setSavingName(true);
    try {
      await updateOwnDisplayName(session.userId, displayNameInput);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setError(null);
    setRemovingUserId(userId);
    try {
      await removeMember(userId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleDissolveCircle() {
    if (!self) return;
    setError(null);
    setDissolving(true);
    try {
      await dissolveCircle(self.circleId);
      await signOut();
      // No manual navigation needed — AuthProvider's onAuthStateChange
      // updates the session to null, and RequireAuth redirects to /auth.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dissolve circle");
      setDissolving(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="page">
      <h1>Circle Settings</h1>

      {error && <p role="alert">{error}</p>}

      {!error && members === null && <p>Loading…</p>}

      {!error && members !== null && (
        <>
          <section>
            <h2>Your name</h2>
            <form onSubmit={handleSaveName}>
              <label>
                Display name
                <input
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={savingName}>
                {savingName ? "Saving…" : "Save"}
              </button>
            </form>
          </section>

          <section>
            <h2>Display language</h2>
            <p>Controls which language product and store names show in, across the app.</p>
            <label className="lang-switch">
              <span className={language === "en" ? "lang-switch-label active" : "lang-switch-label"}>
                English
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={language === "zh"}
                onChange={(event) => setLanguage(event.target.checked ? "zh" : "en")}
                aria-label="Display language"
              />
              <span className={language === "zh" ? "lang-switch-label active" : "lang-switch-label"}>
                中文
              </span>
            </label>
            <p className="lang-preview">
              Preview: {pickText("Countdown Supermarket", "城内城外超市", language)}
            </p>
          </section>

          <section>
            <h2>Members</h2>
            <ul>
              {members.map((member) => (
                <li key={member.userId}>
                  {member.displayName} ({member.role})
                  {isOwner && member.userId !== session?.userId && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removingUserId === member.userId}
                      >
                        {removingUserId === member.userId ? "Removing…" : "Remove"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isOwner && self && (
            <section>
              <h2>Dissolve circle</h2>
              <p>
                This permanently removes every member and deletes the circle's data. Type{" "}
                {DISSOLVE_CONFIRM_TEXT} to confirm.
              </p>
              <label>
                Confirm
                <input
                  value={dissolveConfirmInput}
                  onChange={(event) => setDissolveConfirmInput(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={handleDissolveCircle}
                disabled={dissolveConfirmInput !== DISSOLVE_CONFIRM_TEXT || dissolving}
              >
                {dissolving ? "Dissolving…" : "Dissolve circle"}
              </button>
            </section>
          )}

          <button type="button" className="btn-secondary" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
    </div>
  );
}
