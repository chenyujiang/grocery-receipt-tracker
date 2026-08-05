import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import PrototypeSwitcher from "./PrototypeSwitcher";
import VariantATable from "./VariantATable";
import VariantBCards from "./VariantBCards";
import VariantCTriage from "./VariantCTriage";
import VariantDCombined from "./VariantDCombined";
import { initialMockUsers } from "./mockUsers";
import type { AdminActions } from "./types";

// PROTOTYPE — answers issue 15 / spec.md Section 16's open "what should the
// admin dashboard look like" question. Switchable via ?variant=. Throwaway
// route only: see mattpocock-skills prototype/UI.md. Not linked from
// anywhere in the real app nav — reached directly at
// /prototype/admin-dashboard during review.
//
// A/B/C were the three original radically-different variants; D is the
// user's chosen direction ("C and B combined") — C's attention-queue +
// circle-grouped structure, rendered with B's card as the display unit.
// D is now the default; A/B/C stay reachable in case the direction needs
// revisiting.
const VARIANTS = [
  { key: "D", name: "Combined (chosen)" },
  { key: "A", name: "Dense table" },
  { key: "B", name: "Card grid" },
  { key: "C", name: "Triage queue + grouped roster" },
];

export default function AdminDashboardPrototype() {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") ?? "D";
  const [users, setUsers] = useState(initialMockUsers);

  const actions: AdminActions = {
    grantDefaultCredit(userId) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, credit: { kind: "credit", capUsd: 1, spentUsd: 0 } } : u)),
      );
    },
    grantCustomCredit(userId, amountUsd) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, credit: { kind: "credit", capUsd: amountUsd, spentUsd: 0 } } : u,
        ),
      );
    },
    toggleBan(userId) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: u.status === "banned" ? "active" : "banned" } : u)),
      );
    },
  };

  return (
    <>
      {variant === "D" && <VariantDCombined users={users} actions={actions} />}
      {variant === "A" && <VariantATable users={users} actions={actions} />}
      {variant === "B" && <VariantBCards users={users} actions={actions} />}
      {variant === "C" && <VariantCTriage users={users} actions={actions} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
