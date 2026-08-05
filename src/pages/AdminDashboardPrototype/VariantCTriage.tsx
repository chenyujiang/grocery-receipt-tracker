import { useMemo, useState } from "react";
import type { VariantProps, AdminActions } from "./types";
import { needsAttention, type MockUser } from "./mockUsers";

// PROTOTYPE variant C — triage queue + grouped roster. Structurally
// different from A/B: instead of one flat list, it puts "who is blocked
// right now" first (the actual thing a busy admin opens this page to find),
// then groups everyone else by circle in collapsible sections with a
// click-to-expand detail panel rather than always-visible inline controls.

function AttentionRow({ user: u, actions }: { user: MockUser; actions: AdminActions }) {
  const reason =
    u.credit.kind === "trial" ? "Used their 1 free upload" : "Hit their $" + u.credit.capUsd.toFixed(2) + " cap";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        background: "var(--warning-bg)",
        borderRadius: "var(--radius-sm)",
        marginBottom: 8,
      }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>{u.displayName}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {reason} · {u.circleName}
        </div>
      </div>
      <button type="button" className="btn-sm" onClick={() => actions.grantDefaultCredit(u.id)}>
        Grant $1
      </button>
    </div>
  );
}

function DetailPanel({ user: u, actions }: { user: MockUser; actions: AdminActions }) {
  const [customAmount, setCustomAmount] = useState("");
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--surface-muted)",
        borderRadius: "var(--radius-sm)",
        marginTop: 4,
        marginBottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 13,
      }}
    >
      <div>Email: {u.email}</div>
      <div>Role: {u.role} in {u.circleName}</div>
      <div>Joined: {u.joinedAt}</div>
      <div>
        Credit:{" "}
        {u.credit.kind === "trial"
          ? u.credit.trialUsed
            ? "free trial used (0/1 remaining)"
            : "free trial available (1/1 remaining)"
          : `$${u.credit.spentUsd.toFixed(2)} of $${u.credit.capUsd.toFixed(2)} used`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn-sm" onClick={() => actions.grantDefaultCredit(u.id)}>
          Grant $1
        </button>
        <input
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Custom $"
          style={{ width: 90 }}
        />
        <button
          type="button"
          className="btn-sm btn-secondary"
          onClick={() => {
            const amount = parseFloat(customAmount);
            if (!Number.isNaN(amount) && amount > 0) {
              actions.grantCustomCredit(u.id, amount);
              setCustomAmount("");
            }
          }}
        >
          Grant custom
        </button>
        <button
          type="button"
          className={u.status === "banned" ? "btn-sm" : "btn-sm btn-danger"}
          onClick={() => actions.toggleBan(u.id)}
        >
          {u.status === "banned" ? "Unban" : "Ban"}
        </button>
      </div>
    </div>
  );
}

export default function VariantCTriage({ users, actions }: VariantProps) {
  const [expandedCircles, setExpandedCircles] = useState<Set<string>>(new Set());
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const attention = users.filter(needsAttention);

  const byCircle = useMemo(() => {
    const map = new Map<string, MockUser[]>();
    for (const u of users) {
      const list = map.get(u.circleName) ?? [];
      list.push(u);
      map.set(u.circleName, list);
    }
    return map;
  }, [users]);

  function toggleCircle(name: string) {
    setExpandedCircles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="page">
      <h1>Admin — Triage</h1>

      <section>
        <h2>Needs attention ({attention.length})</h2>
        {attention.length === 0 && <p>Nobody is blocked right now.</p>}
        {attention.map((u) => (
          <AttentionRow key={u.id} user={u} actions={actions} />
        ))}
      </section>

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
              {isOpen &&
                members.map((u) => (
                  <div key={u.id} style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between" }}
                      onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                    >
                      <span>
                        {u.displayName} {u.status === "banned" && "(banned)"}
                      </span>
                      <span>{expandedUserId === u.id ? "−" : "+"}</span>
                    </button>
                    {expandedUserId === u.id && <DetailPanel user={u} actions={actions} />}
                  </div>
                ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
