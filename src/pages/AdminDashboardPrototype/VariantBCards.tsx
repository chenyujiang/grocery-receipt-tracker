import type { VariantProps } from "./types";
import UserCard from "./UserCard";

// PROTOTYPE variant B — card grid, echoing the app's existing
// .receipt-card look (see ReceiptList/index.css) instead of inventing a new
// admin-panel visual language. One card per user, stacked vertically,
// mobile-first — the primary affordance is the whole card, not a row.

export default function VariantBCards({ users, actions }: VariantProps) {
  return (
    <div className="page">
      <h1>Admin — Users</h1>
      <p>{users.length} accounts, all circles.</p>
      <ul className="receipt-list">
        {users.map((u) => (
          <UserCard key={u.id} user={u} actions={actions} />
        ))}
      </ul>
    </div>
  );
}
