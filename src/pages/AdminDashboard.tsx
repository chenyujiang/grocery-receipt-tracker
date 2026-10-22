import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "@/lib/errorMessage";
import { useLanguage } from "@/lib/LanguageProvider";
import { roleLabel } from "@/lib/i18n";
import { useLatestRequest } from "@/lib/useLatestRequest";
import {
  fetchAdminUsers,
  grantAdminCredit,
  setAdminUserBanned,
  mergeUsersIntoCircle,
  FREE_TRIAL_LIMIT,
  DEFAULT_GRANT_USD,
  type AdminUserRow,
} from "@/lib/adminApi";

// Issue 15: the winning /prototype direction (variant D) folded into a real
// page — a needs-attention queue up top, then the full roster grouped by
// circle in collapsible sections, each user shown as a card. Standalone
// page, not wrapped in AppShell/bottom nav (decision 8) — App.tsx mounts it
// at the hidden path behind RequireGlobalAdmin.

function needsAttention(user: AdminUserRow): boolean {
  if (user.banned) return false;
  if (user.credit.mode === "trial") return user.credit.callsUsed >= FREE_TRIAL_LIMIT;
  return user.credit.spentUsd >= user.credit.capUsd;
}

// Groups the circle-less users in the roster. Not the translated "(no
// circle)" label: that would merge them with a real circle of that name, and
// a language switch would change the key and drop the group's expanded
// state. Postgres text can't hold a NUL, so no circle name can equal this.
const NO_CIRCLE_KEY = "\u0000no-circle";

interface UserCardProps {
  user: AdminUserRow;
  onChange: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  error: string | null;
  onError: (message: string | null) => void;
}

function UserCard({ user, onChange, selected, onToggleSelect, error, onError }: UserCardProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLanguage();
  const flagged = needsAttention(user);

  // Issue 22: every action here is consequential — a grant is a reset, not a
  // top-up (issue 15 decision 4) — so a failure must never look like a dead
  // button. The message is held per *user* by the page rather than per card,
  // because a flagged user is rendered twice (needs-attention queue and circle
  // roster); card-local state would leave the other copy looking untouched.
  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    onError(null);
    try {
      await action();
      onChange();
    } catch (err) {
      onError(errorMessage(err, t("errors.adminActionFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className="receipt-card"
      style={{ border: flagged ? "1px solid var(--warning)" : "1px solid var(--border)" }}
    >
      <div className="receipt-card-row">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            aria-label={t("admin.selectUser", { name: user.displayName })}
            checked={selected}
            onChange={onToggleSelect}
          />
          <div>
            <div className="receipt-card-store">{user.displayName}</div>
            <div className="receipt-card-date">{user.email}</div>
          </div>
        </div>
        {flagged && <span className="receipt-card-badge">{t("admin.needsCredit")}</span>}
        {user.banned && (
          <span
            className="receipt-card-badge"
            style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
          >
            {t("admin.banned")}
          </span>
        )}
      </div>

      <div className="receipt-card-row">
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {user.circleName ?? t("admin.noCircle")} · {roleLabel(user.role, t)} ·{" "}
          {t("admin.joined", { date: user.joinedAt.slice(0, 10) })}
        </span>
      </div>

      <div className="receipt-card-row">
        {user.credit.mode === "trial" ? (
          <span style={{ fontSize: 13 }}>
            {user.credit.callsUsed >= FREE_TRIAL_LIMIT
              ? t("admin.trialUsedUp")
              : t("admin.trialProgress", { used: user.credit.callsUsed, limit: FREE_TRIAL_LIMIT })}
          </span>
        ) : (
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {t("admin.creditProgress", {
              spent: user.credit.spentUsd.toFixed(2),
              cap: user.credit.capUsd.toFixed(2),
            })}
          </span>
        )}
      </div>

      <div className="receipt-card-actions-row">
        <div className="receipt-card-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => withBusy(() => grantAdminCredit(user.userId))}
          >
            {t("admin.grantDefault", { amount: DEFAULT_GRANT_USD })}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setShowCustom((value) => !value)}
          >
            {t("admin.custom")}
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="receipt-card-row" style={{ marginTop: 8 }}>
          <input
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder={t("admin.customPlaceholder")}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn-sm"
            disabled={busy}
            onClick={() => {
              // Number(), not parseFloat(): parseFloat("5abc") is 5, and since a
              // grant is a reset, that would quietly cap the user at an amount
              // nobody typed. What survives this is what grant-credit.ts accepts
              // (finite and positive), so the two guards agree rather than letting
              // "Infinity" through to come back as an unexplained 400. The typed
              // text is left in the box so it can be corrected, not retyped.
              const amount = Number(customAmount.trim());
              if (!Number.isFinite(amount) || amount <= 0) {
                onError(t("admin.invalidAmount"));
                return;
              }
              void withBusy(async () => {
                await grantAdminCredit(user.userId, amount);
                setCustomAmount("");
                setShowCustom(false);
              });
            }}
          >
            {t("admin.grant")}
          </button>
        </div>
      )}

      <div className="receipt-card-actions-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={user.banned ? "receipt-card-view-btn" : "btn-danger"}
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => withBusy(() => setAdminUserBanned(user.userId, !user.banned))}
        >
          {user.banned ? t("admin.unban") : t("admin.ban")}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </li>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCircles, setExpandedCircles] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string | null>>({});

  function setCardError(userId: string, message: string | null) {
    setCardErrors((prev) => ({ ...prev, [userId]: message }));
  }

  const startLoad = useLatestRequest();

  // Each call supersedes the previous one; returns a canceller, so the effect
  // below can drop a response that lands after the page was left.
  function load() {
    const { guard, cancel } = startLoad();
    setError(null);
    fetchAdminUsers()
      .then(guard(setUsers))
      .catch(guard((err: unknown) => setError(errorMessage(err, t("errors.loadUsers")))));
    return cancel;
  }

  useEffect(load, []);

  function toggleCircle(name: string) {
    setExpandedCircles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleSelected(userId: string) {
    // The message sits next to the merge button, which disappears below two
    // selected users — so changing the selection has to take it down with it.
    setMergeError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function mergeSelected() {
    setMerging(true);
    setMergeError(null);
    try {
      await mergeUsersIntoCircle([...selected]);
      setSelected(new Set());
      load();
    } catch (err) {
      // Kept out of `error`, which hides the whole roster: a failed merge should
      // leave the selection on screen to retry or adjust. merge_users_into_new_circle
      // refuses a multi-member circle, and that reason is worth reading.
      setMergeError(errorMessage(err, t("errors.mergeUsers")));
    } finally {
      setMerging(false);
    }
  }

  const attention = (users ?? []).filter(needsAttention);

  const byCircle = new Map<string, AdminUserRow[]>();
  for (const user of users ?? []) {
    const key = user.circleName ?? NO_CIRCLE_KEY;
    const list = byCircle.get(key) ?? [];
    list.push(user);
    byCircle.set(key, list);
  }

  return (
    <div className="page">
      <h1>{t("admin.title")}</h1>
      <button
        type="button"
        className="btn-secondary btn-block"
        style={{ marginTop: 0, marginBottom: 16 }}
        onClick={() => navigate("/")}
      >
        {t("admin.goToMyAccount")}
      </button>

      {error && <p role="alert">{error}</p>}
      {!error && users === null && <p>{t("common.loading")}</p>}

      {!error && users !== null && (
        <>
          <section>
            <h2>{t("admin.needsAttention", { count: attention.length })}</h2>
            {attention.length === 0 && <p>{t("admin.nobodyBlocked")}</p>}
            {attention.length > 0 && (
              <ul className="receipt-list">
                {attention.map((user) => (
                  <UserCard
                    key={user.userId}
                    user={user}
                    onChange={load}
                    selected={selected.has(user.userId)}
                    onToggleSelect={() => toggleSelected(user.userId)}
                    error={cardErrors[user.userId] ?? null}
                    onError={(message) => setCardError(user.userId, message)}
                  />
                ))}
              </ul>
            )}
          </section>

          {mergeError && <p role="alert">{mergeError}</p>}

          {selected.size >= 2 && (
            <div className="receipt-card-actions-row" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="btn-danger"
                disabled={merging}
                onClick={() => void mergeSelected()}
              >
                {t("admin.mergeSelected", { count: selected.size })}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={merging}
                onClick={() => {
                  setMergeError(null);
                  setSelected(new Set());
                }}
              >
                {t("admin.clearSelection")}
              </button>
            </div>
          )}

          <section>
            <h2>{t("admin.allUsersByCircle")}</h2>
            {[...byCircle.entries()].map(([circleKey, members]) => {
              const isOpen = expandedCircles.has(circleKey);
              const circleName = circleKey === NO_CIRCLE_KEY ? t("admin.noCircle") : circleKey;
              return (
                <div key={circleKey} style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary btn-block"
                    style={{ textAlign: "left", marginTop: 0 }}
                    onClick={() => toggleCircle(circleKey)}
                  >
                    {isOpen ? "▾" : "▸"} {circleName} ({members.length})
                  </button>
                  {isOpen && (
                    <ul className="receipt-list" style={{ marginTop: 8 }}>
                      {members.map((user) => (
                        <UserCard
                          key={user.userId}
                          user={user}
                          onChange={load}
                          selected={selected.has(user.userId)}
                          onToggleSelect={() => toggleSelected(user.userId)}
                          error={cardErrors[user.userId] ?? null}
                          onError={(message) => setCardError(user.userId, message)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
