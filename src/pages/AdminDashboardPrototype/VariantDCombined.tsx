import { useMemo, useState } from "react";
import type { VariantProps } from "./types";
import { needsAttention, type MockUser } from "./mockUsers";
import UserCard from "./UserCard";

// PROTOTYPE variant D — combines C's structure (a "needs attention" queue
// up top, then the full roster grouped by circle in collapsible sections)
// with B's card as the actual unit of display, instead of C's plain
// rows/click-to-expand detail panel. Chosen by the user as "C and B
// combined" after reviewing all three original variants.

export default function VariantDCombined({ users, actions }: VariantProps) {
  const [expandedCircles, setExpandedCircles] = useState<Set<string>>(new Set());

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
      <h1>Admin — Users</h1>

      <section>
        <h2>Needs attention ({attention.length})</h2>
        {attention.length === 0 && <p>Nobody is blocked right now.</p>}
        {attention.length > 0 && (
          <ul className="receipt-list">
            {attention.map((u) => (
              <UserCard key={u.id} user={u} actions={actions} />
            ))}
          </ul>
        )}
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
              {isOpen && (
                <ul className="receipt-list" style={{ marginTop: 8 }}>
                  {members.map((u) => (
                    <UserCard key={u.id} user={u} actions={actions} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
