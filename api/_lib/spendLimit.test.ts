import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (Section 3.1: global hard-dollar spend cap).
vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "./supabaseAdmin";
import { getSpendStatus, recordSpend } from "./spendLimit";

function selectSingleChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  return { select };
}

function updateEqChain(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn(() => ({ eq }));
  return { update };
}

describe("getSpendStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports overCap: false when spending is below the cap", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectSingleChain({ data: { spent_usd: 0.2, cap_usd: 1.0 }, error: null }) as never
    );

    const status = await getSpendStatus();

    expect(status).toEqual({ spentUsd: 0.2, capUsd: 1.0, overCap: false });
  });

  it("reports overCap: true once spending has reached the cap", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      selectSingleChain({ data: { spent_usd: 1.0, cap_usd: 1.0 }, error: null }) as never
    );

    const status = await getSpendStatus();

    expect(status.overCap).toBe(true);
  });
});

describe("recordSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the new cost onto the existing spent_usd", async () => {
    const selectChain = selectSingleChain({
      data: { spent_usd: 0.3, cap_usd: 1.0 },
      error: null,
    });
    const updateChain = updateEqChain({ error: null });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      ...selectChain,
      ...updateChain,
    } as never);

    await recordSpend(0.05);

    expect(updateChain.update).toHaveBeenCalledWith({ spent_usd: 0.35 });
  });
});
