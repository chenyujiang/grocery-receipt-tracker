// PROTOTYPE data — answers spec.md Section 16 / issue 15's "not yet specified"
// UI question. In-memory only, thrown away once a variant is picked.

export type AccountStatus = "active" | "banned";

export type CreditState =
  | { kind: "trial"; trialUsed: boolean }
  | { kind: "credit"; capUsd: number; spentUsd: number };

export interface MockUser {
  id: string;
  displayName: string;
  email: string;
  circleName: string;
  role: "owner" | "member";
  joinedAt: string;
  status: AccountStatus;
  credit: CreditState;
}

export function needsAttention(user: MockUser): boolean {
  if (user.status === "banned") return false;
  if (user.credit.kind === "trial") return user.credit.trialUsed;
  return user.credit.spentUsd >= user.credit.capUsd;
}

export function initialMockUsers(): MockUser[] {
  return [
    {
      id: "u1",
      displayName: "Alice Chen",
      email: "alice.chen@example.com",
      circleName: "Chen Family",
      role: "owner",
      joinedAt: "2026-01-05",
      status: "active",
      credit: { kind: "trial", trialUsed: false },
    },
    {
      id: "u2",
      displayName: "Ben Wu",
      email: "ben.wu@example.com",
      circleName: "Chen Family",
      role: "member",
      joinedAt: "2026-02-10",
      status: "active",
      credit: { kind: "trial", trialUsed: true },
    },
    {
      id: "u3",
      displayName: "Carol Li",
      email: "carol.li@example.com",
      circleName: "Wu Household",
      role: "owner",
      joinedAt: "2026-01-20",
      status: "active",
      credit: { kind: "credit", capUsd: 1, spentUsd: 1 },
    },
    {
      id: "u4",
      displayName: "David Zhang",
      email: "david.zhang@example.com",
      circleName: "Wu Household",
      role: "member",
      joinedAt: "2026-01-22",
      status: "active",
      credit: { kind: "credit", capUsd: 1, spentUsd: 0.12 },
    },
    {
      id: "u5",
      displayName: "Emma Liu",
      email: "emma.liu@example.com",
      circleName: "Lee Circle",
      role: "owner",
      joinedAt: "2025-12-01",
      status: "active",
      credit: { kind: "credit", capUsd: 5, spentUsd: 4.8 },
    },
    {
      id: "u6",
      displayName: "Frank Zhao",
      email: "frank.zhao@example.com",
      circleName: "Lee Circle",
      role: "member",
      joinedAt: "2026-03-01",
      status: "banned",
      credit: { kind: "credit", capUsd: 1, spentUsd: 0.5 },
    },
    {
      id: "u7",
      displayName: "Grace Huang",
      email: "grace.huang@example.com",
      circleName: "Chen Family",
      role: "member",
      joinedAt: "2026-08-01",
      status: "active",
      credit: { kind: "trial", trialUsed: false },
    },
    {
      id: "u8",
      displayName: "Henry Xu",
      email: "henry.xu@example.com",
      circleName: "Xu Solo",
      role: "owner",
      joinedAt: "2026-07-15",
      status: "active",
      credit: { kind: "credit", capUsd: 1, spentUsd: 1 },
    },
  ];
}
