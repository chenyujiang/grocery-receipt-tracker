import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (issue 15: per-user free-trial-then-dollar-cap
// AI-call access, replacing the old global ai_spend_limit).
vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "./supabaseAdmin";
import { getAccessStatus, recordSuccess } from "./userAiAccess";

function selectMaybeSingleChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, maybeSingle };
}

function upsertChain(result: { error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  return { upsert };
}

function updateEqChain(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn(() => ({ eq }));
  return { update };
}

describe("getAccessStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a brand-new user with no row yet (free trial available)", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectMaybeSingleChain({ data: null, error: null }) as never
    );

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({ allowed: true, mode: "trial", spentUsd: 0, capUsd: null });
  });

  it("allows a user whose row exists but hasn't used their free trial yet", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectMaybeSingleChain({
        data: { free_trial_used: false, cap_usd: null, spent_usd: 0 },
        error: null,
      }) as never
    );

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({ allowed: true, mode: "trial", spentUsd: 0, capUsd: null });
  });

  it("refuses a user who has already used their free trial and has no dollar cap yet", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectMaybeSingleChain({
        data: { free_trial_used: true, cap_usd: null, spent_usd: 0 },
        error: null,
      }) as never
    );

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({ allowed: false, mode: "trial", spentUsd: 0, capUsd: null });
  });

  it("allows a dollar-cap user under their cap", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectMaybeSingleChain({
        data: { free_trial_used: true, cap_usd: 1.0, spent_usd: 0.3 },
        error: null,
      }) as never
    );

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({ allowed: true, mode: "cap", spentUsd: 0.3, capUsd: 1.0 });
  });

  it("refuses a dollar-cap user who has reached their cap", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectMaybeSingleChain({
        data: { free_trial_used: true, cap_usd: 1.0, spent_usd: 1.0 },
        error: null,
      }) as never
    );

    const status = await getAccessStatus("user-1");

    expect(status.allowed).toBe(false);
  });
});

describe("recordSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the free trial used when the caller was in trial mode", async () => {
    const selectChain = selectMaybeSingleChain({ data: null, error: null });
    const upsertChainResult = upsertChain({ error: null });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      ...selectChain,
      ...upsertChainResult,
    } as never);

    await recordSuccess("user-1", 0.002);

    expect(upsertChainResult.upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      free_trial_used: true,
    });
  });

  it("adds the new cost onto the existing spent_usd when the caller is in dollar-cap mode", async () => {
    const selectChain = selectMaybeSingleChain({
      data: { free_trial_used: true, cap_usd: 1.0, spent_usd: 0.3 },
      error: null,
    });
    const updateChain = updateEqChain({ error: null });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      ...selectChain,
      ...updateChain,
    } as never);

    await recordSuccess("user-1", 0.05);

    expect(updateChain.update).toHaveBeenCalledWith({ spent_usd: 0.35 });
  });
});
