// PostgREST caps every response at its max-rows setting (Supabase default:
// 1000) and drops the rest without an error. A read that can exceed it goes a
// page at a time, until a page shorter than this says there's nothing left.
//
// This must not exceed max-rows: the server would cut a full page short, the
// short page would look like the last one, and the read would stop early
// without an error.
//
// Nor may it exceed 1000, Storage's limit for one remove(): a page of paths
// goes to Storage in a single call. So it can't go past 1000 even with a
// higher max-rows.
//
// The /api functions load this too, so it stays free of `import.meta.env`
// and the `@/` alias (see purchaseHistory.ts).
export const POSTGREST_PAGE_SIZE = 1000;
