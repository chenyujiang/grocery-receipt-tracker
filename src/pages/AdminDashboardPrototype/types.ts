import type { MockUser } from "./mockUsers";

// PROTOTYPE-ONLY shared shape. Actions are stubs — they mutate in-memory
// state only, never a real API (prototype/UI.md rule: read-only, no real
// mutations).
export interface AdminActions {
  grantDefaultCredit(userId: string): void;
  grantCustomCredit(userId: string, amountUsd: number): void;
  toggleBan(userId: string): void;
}

export interface VariantProps {
  users: MockUser[];
  actions: AdminActions;
}
