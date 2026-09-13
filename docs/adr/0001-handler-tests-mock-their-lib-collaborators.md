# Route handler tests mock their `_lib` collaborators, not just Supabase

CLAUDE.md's testing rule is "mock the Supabase client, never Supabase internals" — that's the boundary for `src/lib` and `api/_lib` modules, which talk to Supabase directly. Route handlers in `api/` are a different layer: their job is HTTP translation and wiring, and their collaborators are the already-tested `api/_lib` modules (`requireGlobalAdmin`, `getAccessStatus`, `recognizeReceipt`, `listAdminUsers`, …). So **a handler test mocks those modules**, and drops to mocking `supabaseAdmin` only where a handler queries Supabase with no `_lib` in between (`recognize.ts`'s profile/storage/products reads, all of `low-stock-check.ts`).

## Considered options

Mocking only `supabaseAdmin` and letting the real `_lib` code run would make each handler test an integration test. Reaching `recognize.ts`'s 402 branch that way needs ~5 chained Supabase stubs plus a stubbed Anthropic client, and it re-asserts `getAccessStatus`'s trial-vs-cap logic, which `userAiAccess.test.ts` already covers exhaustively. The handler's own contribution — "a refusal becomes HTTP 402 with this body" — would be buried in setup.

## Consequences

A handler test can't catch a contract drift between a handler and its `_lib` collaborator (wrong argument order, a renamed field) — nothing in the suite exercises the two together. That's accepted: TypeScript catches the shape errors, and the alternative costs more than it detects.

`vi.mock` paths must match the handler's import specifier exactly, including the `.js` extension the handlers use for their `.ts` collaborators (`vi.mock("../_lib/userAiAccess.js", …)`). Mocking `"../_lib/userAiAccess"` silently does nothing.
