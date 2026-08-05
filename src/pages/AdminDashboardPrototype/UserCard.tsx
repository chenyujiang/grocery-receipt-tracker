import { useState } from "react";
import type { AdminActions } from "./types";
import { needsAttention, type MockUser } from "./mockUsers";

// PROTOTYPE — the card used by variant B and the combined B+C variant.
// Echoes the app's existing .receipt-card look (see ReceiptList/index.css)
// instead of inventing a new admin-panel visual language.
export default function UserCard({ user: u, actions }: { user: MockUser; actions: AdminActions }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const flagged = needsAttention(u);

  return (
    <li
      className="receipt-card"
      style={{
        padding: "16px 18px",
        border: flagged ? "1px solid var(--warning)" : "1px solid var(--border)",
      }}
    >
      <div className="receipt-card-row">
        <div>
          <div className="receipt-card-store">{u.displayName}</div>
          <div className="receipt-card-date">{u.email}</div>
        </div>
        {flagged && <span className="receipt-card-badge">Needs credit</span>}
        {u.status === "banned" && (
          <span className="receipt-card-badge" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>
            Banned
          </span>
        )}
      </div>

      <div className="receipt-card-row">
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {u.circleName} · {u.role} · joined {u.joinedAt}
        </span>
      </div>

      <div className="receipt-card-row">
        {u.credit.kind === "trial" ? (
          <span style={{ fontSize: 13 }}>
            {u.credit.trialUsed ? "Free trial used — awaiting credit" : "Free trial not yet used (1 available)"}
          </span>
        ) : (
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            ${u.credit.spentUsd.toFixed(2)} of ${u.credit.capUsd.toFixed(2)} used
          </span>
        )}
      </div>

      <div className="receipt-card-actions-row">
        <div className="receipt-card-actions">
          <button type="button" onClick={() => actions.grantDefaultCredit(u.id)}>
            Grant $1
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShowCustom((s) => !s)}>
            Custom…
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="receipt-card-row" style={{ marginTop: 8 }}>
          <input
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="e.g. 5.00"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn-sm"
            onClick={() => {
              const amount = parseFloat(customAmount);
              if (!Number.isNaN(amount) && amount > 0) {
                actions.grantCustomCredit(u.id, amount);
                setCustomAmount("");
                setShowCustom(false);
              }
            }}
          >
            Grant
          </button>
        </div>
      )}

      <div className="receipt-card-actions-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={u.status === "banned" ? "receipt-card-view-btn" : "btn-danger"}
          style={{ flex: 1 }}
          onClick={() => actions.toggleBan(u.id)}
        >
          {u.status === "banned" ? "Unban account" : "Ban account"}
        </button>
      </div>
    </li>
  );
}
