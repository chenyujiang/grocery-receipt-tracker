import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminUsers,
  grantAdminCredit,
  setAdminUserBanned,
  mergeUsersIntoCircle,
  type AdminUserRow,
} from "@/lib/adminApi";

// Issue 15: the winning /prototype direction (variant D) folded into a real
// page — a needs-attention queue up top, then the full roster grouped by
// circle in collapsible sections, each user shown as a card. Standalone
// page, not wrapped in AppShell/bottom nav (decision 8) — App.tsx mounts it
// at the hidden path behind RequireGlobalAdmin.

function needsAttention(user: AdminUserRow): boolean {
  if (user.banned) return false;
  if (user.credit.mode === "trial") return user.credit.trialUsed;
  return user.credit.spentUsd >= user.credit.capUsd;
}

interface UserCardProps {
  user: AdminUserRow;
  onChange: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}

function UserCard({ user, onChange, selected, onToggleSelect }: UserCardProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const flagged = needsAttention(user);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onChange();
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
            aria-label={`Select ${user.displayName}`}
            checked={selected}
            onChange={onToggleSelect}
          />
          <div>
            <div className="receipt-card-store">{user.displayName}</div>
            <div className="receipt-card-date">{user.email}</div>
          </div>
        </div>
        {flagged && <span className="receipt-card-badge">Needs credit</span>}
        {user.banned && (
          <span
            className="receipt-card-badge"
            style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
          >
            Banned
          </span>
        )}
      </div>

      <div className="receipt-card-row">
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {user.circleName ?? "(no circle)"} · {user.role} · joined {user.joinedAt.slice(0, 10)}
        </span>
      </div>

      <div className="receipt-card-row">
        {user.credit.mode === "trial" ? (
          <span style={{ fontSize: 13 }}>
            {user.credit.trialUsed
              ? "Free trial used — awaiting credit"
              : "Free trial not yet used (1 available)"}
          </span>
        ) : (
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            ${user.credit.spentUsd.toFixed(2)} of ${user.credit.capUsd.toFixed(2)} used
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
            Grant $1
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setShowCustom((value) => !value)}
          >
            Custom…
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="receipt-card-row" style={{ marginTop: 8 }}>
          <input
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder="e.g. 5.00"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn-sm"
            disabled={busy}
            onClick={() => {
              const amount = parseFloat(customAmount);
              if (Number.isNaN(amount) || amount <= 0) return;
              void withBusy(async () => {
                await grantAdminCredit(user.userId, amount);
                setCustomAmount("");
                setShowCustom(false);
              });
            }}
          >
            Grant
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
          {user.banned ? "Unban account" : "Ban account"}
        </button>
      </div>
    </li>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCircles, setExpandedCircles] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  function load() {
    setError(null);
    fetchAdminUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function mergeSelected() {
    setMerging(true);
    try {
      await mergeUsersIntoCircle([...selected]);
      setSelected(new Set());
      load();
    } finally {
      setMerging(false);
    }
  }

  const attention = (users ?? []).filter(needsAttention);

  const byCircle = new Map<string, AdminUserRow[]>();
  for (const user of users ?? []) {
    const key = user.circleName ?? "(no circle)";
    const list = byCircle.get(key) ?? [];
    list.push(user);
    byCircle.set(key, list);
  }

  return (
    <div className="page">
      <h1>Admin — Users</h1>
      <button
        type="button"
        className="btn-secondary btn-block"
        style={{ marginTop: 0, marginBottom: 16 }}
        onClick={() => navigate("/")}
      >
        Go to my account
      </button>

      {error && <p role="alert">{error}</p>}
      {!error && users === null && <p>Loading…</p>}

      {!error && users !== null && (
        <>
          <section>
            <h2>Needs attention ({attention.length})</h2>
            {attention.length === 0 && <p>Nobody is blocked right now.</p>}
            {attention.length > 0 && (
              <ul className="receipt-list">
                {attention.map((user) => (
                  <UserCard
                    key={user.userId}
                    user={user}
                    onChange={load}
                    selected={selected.has(user.userId)}
                    onToggleSelect={() => toggleSelected(user.userId)}
                  />
                ))}
              </ul>
            )}
          </section>

          {selected.size >= 2 && (
            <div className="receipt-card-actions-row" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="btn-danger"
                disabled={merging}
                onClick={() => void mergeSelected()}
              >
                Merge {selected.size} users into a circle
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={merging}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}

          <section>
            <h2>All users, by circle</h2>
            {[...byCircle.entries()].map(([circleName, members]) => {
              const isOpen = expandedCircles.has(circleName);
              return (
                <div key={circleName} style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary btn-block"
                    style={{ textAlign: "left", marginTop: 0 }}
                    onClick={() => toggleCircle(circleName)}
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
