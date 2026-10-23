// The {spent}/{cap} params of an AI Credit's copy, shared by the admin
// dashboard's progress line and the upload page's refusal. Rounded to the
// cent: spend is summed per-call costs, so it's rarely a clean float.
export function creditAmounts(credit: { spentUsd: number; capUsd: number }): {
  spent: string;
  cap: string;
} {
  return { spent: credit.spentUsd.toFixed(2), cap: credit.capUsd.toFixed(2) };
}
