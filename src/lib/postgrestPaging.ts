// PostgREST caps every response at its max-rows setting (Supabase default:
// 1000) and drops the rest without an error. A read that can exceed it goes a
// page at a time, until a page shorter than this says there's nothing left.
//
// This must not exceed max-rows: the server would cut a full page short, the
// short page would look like the last one, and the read would stop early
// without an error. Raise it only together with the project's max-rows.
//
// It also must not exceed 1000, Storage's limit for one remove():
// expire-receipt-images.ts sends a page of paths in a single call.
//
// The /api functions load this too, so it stays free of `import.meta.env`
// and the `@/` alias (see purchaseHistory.ts).
export const POSTGREST_PAGE_SIZE = 1000;
