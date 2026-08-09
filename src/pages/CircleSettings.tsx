import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { signOut } from "@/lib/auth";
import { fetchCircleMembers, type CircleMember } from "@/lib/circleMembers";
import { updateOwnDisplayName, removeMember, dissolveCircle } from "@/lib/circleActions";
import { isGlobalAdmin, ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";

const DISSOLVE_CONFIRM_TEXT = "DISSOLVE";

// Hidden per product decision — circle consolidation is now an admin-only
// action (the admin dashboard's merge-users-into-a-circle flow), so letting
// an owner unilaterally dissolve their own circle no longer fits the model.
// Code and tests kept intact so it's a one-line flip to bring back.
const SHOW_DISSOLVE_CIRCLE = false;

// Section 4 + 15, page 7: member management. Invite links need an
// email-sending service the app doesn't have yet (spec.md Section 4), so
// joining a circle is still owner-at-signup only — see README.
export default function CircleSettings() {
  const { session } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [members, setMembers] = useState<CircleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const [dissolveConfirmInput, setDissolveConfirmInput] = useState("");
  const [dissolving, setDissolving] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  // Issue 15 decision 8's post-login redirect is a one-time thing right
  // after sign-in; this is the persistent way back in for whoever's
  // actually a global admin (checked server-side by RequireGlobalAdmin
  // regardless of what this shows).
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session) return;
    isGlobalAdmin(session.userId)
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false));
  }, [session?.userId]);

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
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  function handleCancelEditName() {
    setDisplayNameInput(self?.displayName ?? "");
    setEditingName(false);
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
      <h1>{t("settings.title")}</h1>

      {error && <p role="alert">{error}</p>}

      {!error && members === null && <p>{t("common.loading")}</p>}

      {!error && members !== null && (
        <>
          <section>
            <h2>{t("settings.yourName")}</h2>
            {editingName ? (
              <form onSubmit={handleSaveName}>
                <label>
                  {t("settings.displayName")}
                  <input
                    value={displayNameInput}
                    onChange={(event) => setDisplayNameInput(event.target.value)}
                    required
                  />
                </label>
                <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
                  <button type="submit" style={{ flex: 1 }} disabled={savingName}>
                    {savingName ? t("settings.saving") : t("settings.save")}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={handleCancelEditName}
                    disabled={savingName}
                  >
                    {t("settings.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p>{self?.displayName}</p>
                <button type="button" className="btn-block" onClick={() => setEditingName(true)}>
                  {t("settings.edit")}
                </button>
              </>
            )}
          </section>

          <section>
            <h2>{t("settings.language")}</h2>
            <p>{t("settings.languageHint")}</p>
            <label className="lang-switch">
              <span className={language === "en" ? "lang-switch-label active" : "lang-switch-label"}>
                {t("settings.languageEn")}
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={language === "zh"}
                onChange={(event) => setLanguage(event.target.checked ? "zh" : "en")}
                aria-label={t("settings.language")}
              />
              <span className={language === "zh" ? "lang-switch-label active" : "lang-switch-label"}>
                {t("settings.languageZh")}
              </span>
            </label>
          </section>

          {isAdmin && (
            <Link
              to={ADMIN_DASHBOARD_PATH}
              className="receipt-card-view-btn"
              style={{ marginTop: 14, marginBottom: 16 }}
            >
              {t("settings.adminDashboard")}
            </Link>
          )}

          <section>
            <h2>{t("settings.members")}</h2>
            <ul>
              {members.map((member) => (
                <li key={member.userId}>
                  {member.displayName} (
                  {member.role === "owner" ? t("settings.roleOwner") : t("settings.roleMember")})
                  {isOwner && member.userId !== session?.userId && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removingUserId === member.userId}
                      >
                        {removingUserId === member.userId ? t("settings.removing") : t("settings.remove")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {SHOW_DISSOLVE_CIRCLE && isOwner && self && (
            <section>
              <h2>{t("settings.dissolveTitle")}</h2>
              <p>{t("settings.dissolveBody", { word: DISSOLVE_CONFIRM_TEXT })}</p>
              <label>
                {t("settings.confirm")}
                <input
                  value={dissolveConfirmInput}
                  onChange={(event) => setDissolveConfirmInput(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-block btn-danger"
                onClick={handleDissolveCircle}
                disabled={dissolveConfirmInput !== DISSOLVE_CONFIRM_TEXT || dissolving}
              >
                {dissolving ? t("settings.dissolving") : t("settings.dissolve")}
              </button>
            </section>
          )}

          <button
            type="button"
            className="btn-dark btn-block"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? t("settings.signingOut") : t("settings.signOut")}
          </button>
        </>
      )}
    </div>
  );
}
