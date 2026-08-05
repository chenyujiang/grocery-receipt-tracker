import { useState } from "react";
import type { VariantProps } from "./types";
import { needsAttention, type MockUser } from "./mockUsers";
import type { AdminActions } from "./types";

// PROTOTYPE variant A — dense data table. Classic admin-panel shape: every
// user is a row, every field is a column, actions live inline at the
// row's right edge. Optimized for scanning many users at once, not for
// mobile.

function CreditCell({ user: u, actions }: { user: MockUser; actions: AdminActions }) {
  const [customAmount, setCustomAmount] = useState("");

  if (u.credit.kind === "trial") {
    return (
      <span style={{ fontSize: 12 }}>
        {u.credit.trialUsed ? "Free trial used (0/1)" : "Free trial available (0/1 used)"}
      </span>
    );
  }
  const pct = Math.min(100, Math.round((u.credit.spentUsd / u.credit.capUsd) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
        ${u.credit.spentUsd.toFixed(2)} / ${u.credit.capUsd.toFixed(2)}
      </span>
      <div style={{ background: "var(--border)", borderRadius: 999, height: 6, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct >= 100 ? "var(--danger)" : "var(--primary)",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="5.00"
          style={{ width: 60, padding: "4px 6px", fontSize: 12 }}
        />
        <button
          type="button"
          className="btn-sm"
          onClick={() => {
            const amount = parseFloat(customAmount);
            if (!Number.isNaN(amount) && amount > 0) {
              actions.grantCustomCredit(u.id, amount);
              setCustomAmount("");
            }
          }}
        >
          Set
        </button>
      </div>
    </div>
  );
}

export default function VariantATable({ users, actions }: VariantProps) {
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <h1>Admin — All Users</h1>
      <p>{users.length} users across all circles.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "8px 10px" }}>User</th>
              <th style={{ padding: "8px 10px" }}>Circle</th>
              <th style={{ padding: "8px 10px" }}>Status</th>
              <th style={{ padding: "8px 10px" }}>Credit</th>
              <th style={{ padding: "8px 10px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: needsAttention(u) ? "var(--warning-bg)" : "transparent",
                }}
              >
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ fontWeight: 700 }}>{u.displayName}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{u.email}</div>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {u.circleName}
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{u.role}</div>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: u.status === "banned" ? "var(--danger-bg)" : "var(--surface-muted)",
                      color: u.status === "banned" ? "var(--danger)" : "var(--text-muted)",
                    }}
                  >
                    {u.status === "banned" ? "Banned" : "Active"}
                  </span>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <CreditCell user={u} actions={actions} />
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button type="button" className="btn-sm" onClick={() => actions.grantDefaultCredit(u.id)}>
                      Grant $1
                    </button>
                    <button
                      type="button"
                      className={u.status === "banned" ? "btn-sm" : "btn-sm btn-danger"}
                      onClick={() => actions.toggleBan(u.id)}
                    >
                      {u.status === "banned" ? "Unban" : "Ban"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
