Type: grilling
Status: resolved

## Question

How should a global admin dashboard for user management and per-user Claude-API credits work, and how does it interact with the existing global `ai_spend_limit` cap (ticket 08) and the per-circle owner/member roles (ticket 02)?

Needs deciding:

- Who can access it — is there a new global-admin identity, distinct from the existing per-circle `owner` role?
- How access is secured — real authorization checks vs. mere URL obscurity, and how the two combine.
- Whether per-user credit replaces or coexists with the existing global spend cap.
- What "granting credit" means semantically — additive top-up vs. reset-to-a-fresh-allowance.
- How account disable/enable is implemented.
- Where the admin dashboard lives in the UI, and how the admin reaches it.
- What a brand-new, never-reviewed user is allowed to do before any admin has looked at them.
- How the "contact the admin" flow works when a user is blocked.
- How already-existing users are migrated into the new model.

## Answer

**1. Admin identity**: a new **global admin** concept, independent of the existing per-circle `owner`/`member` role on `profiles`. It spans every circle — the admin (in practice, a single person: the app owner) can see and manage all users regardless of which circle they belong to. This does not change the existing per-circle owner's powers (invite/remove members, dissolve circle, still scoped to their own circle).

**2. Access security — two layers**:
- **Authorization (authoritative)**: both the frontend route and every backend admin API endpoint check the current user's global-admin flag; non-admins are refused regardless of what URL they hit.
- **Obscurity (supplementary, not a substitute)**: the admin dashboard is served from a non-obvious, unguessable path (not `/admin`), and a non-admin hitting that path gets a 404, not a login redirect — so the route's existence isn't revealed to anyone probing it.
- Stronger verification (e.g. a second factor, IP allowlisting) is explicitly deferred — noted for a future round, not built now.

**3. Per-user credit replaces the global cap**: ticket 08's single global `ai_spend_limit` singleton (shared `cap_usd`/`spent_usd` across the whole app) is replaced outright by a per-user allowance. Each user has their own cap and their own spend counter; one user running out never affects anyone else's ability to call the API. There is no overarching global ceiling layered on top.

**4. "Granting credit" is a reset, not a top-up**: clicking "grant credit" for a user zeroes their spend counter and sets their cap to a value — **$1 by default** (one click, no typing), or any admin-entered custom amount. It is always a fresh, independent allowance; it has no relationship to whatever they had used or been granted before. This matches the intended workflow: a user maxes out, the admin clicks once, and they have a clean $1 (or whatever amount) to use again.

**5. Disable/enable via Supabase Auth's own ban mechanism**: implemented with `auth.admin.updateUserById(..., { ban_duration })` (enable = clear the ban) rather than an app-level `is_active` column. A disabled user is rejected at the authentication layer itself (including on session/token refresh) — there's no separate flag to remember to check in every route or API handler.

**6. Brand-new users get a hard one-time free trial, not a dollar allowance**: on signup, a new user gets exactly **one free successful recognition call** — tracked as a count, not a dollar amount, since a single Haiku 4.5 call costs a small fraction of $1 and a dollar-based allowance wouldn't actually limit them to one use. Only a *successful* recognition consumes it — a failed/errored attempt does not. Once that one free use is consumed, every subsequent recognition attempt is refused until an admin grants them a real (dollar-based) credit per decision 4. This is a separate mechanism from the per-user dollar cap — new users start in "1 free use" mode and graduate to "dollar cap" mode the first time an admin grants them credit.

**7. Blocked users are told to email the admin — a plain `mailto:` link, no backend email sending**: when a user is refused (free trial used up, or dollar cap hit), the UI shows a message and a `mailto:nz.eason.chen@gmail.com` link/button that opens the user's own email client with a pre-filled draft. The user decides whether/what to send. No transactional email service is introduced — the stack has none today (Vercel Serverless + Supabase only), and adding one is out of scope for this ticket.

**8. Admin dashboard placement — hidden from normal navigation, reached via a one-time post-login redirect**: the dashboard never appears in the bottom tab bar or any menu a normal user can see. It isn't wrapped in the existing `AppShell`/bottom-nav chrome — it's its own standalone console-style page. When a global admin logs in, they land on the admin dashboard first (a one-time redirect right after login, not an every-page interception); from there, a visible "go to my account" control lets the admin switch into the normal app UI and navigate freely without being pulled back.

**9. Existing users are grandfathered, not dropped into the free-trial flow**: at migration time, every user who already exists gets an initial dollar-based cap directly (defaulting to $1, or set per-user by the admin) — they skip the "1 free use" restriction from decision 6 entirely, since they've already been using the app under the old global-cap trust model.

## UI Prototype

Resolved via `/prototype` (see mattpocock-skills prototype/UI.md): three structurally different layouts were built with mock data — **A** (dense admin table), **B** (card grid matching the app's existing `.receipt-card` look), **C** (a "needs attention" triage queue + circle-grouped roster with click-to-expand rows). After reviewing all three, the chosen direction is **C's structure rendered with B's card as the display unit**: a "needs attention" queue up top surfacing exactly who is blocked and why (free trial used / cap hit) with one-click "Grant $1" already visible on the card, followed by the full roster grouped by circle in collapsible sections, each user shown as a full card (name/email, circle/role/joined date, credit state, Grant $1 / custom-amount / ban-unban actions) rather than a plain row needing a separate expand step.

The full prototype (all four variants, switchable via `?variant=`) is captured on the throwaway branch `prototype/admin-dashboard-ui`, not on main — main only keeps this written decision. Pull that branch if the direction needs revisiting instead of rebuilding from scratch.

## Schema Design (draft)

Concrete tables/RLS for the model above, written to match this codebase's existing conventions (see `supabase/migrations/20260804000007_ai_spend_limit.sql` and `api/_lib/spendLimit.ts` for the pattern being followed: a table read-only to `authenticated`, writable only by the backend's service-role client). **Not yet applied** — this is a design draft, not a migration file.

**Why not just add columns to `profiles`?** `profiles` already has a working RLS policy (`20260805000004_profiles_update_own_display_name.sql`) letting a user `UPDATE` their *own row* — but Postgres RLS restricts rows, not columns. A policy scoped to `user_id = auth.uid()` would let a user overwrite *any* column on their own row via a direct client call, including a hypothetical `is_global_admin` or `free_trial_used` column — i.e. self-promotion to admin, or clearing their own trial-used flag, by calling `supabase.from("profiles").update(...)` themselves. Two new, separate tables avoid touching that existing policy surface at all: neither gets an `insert`/`update`/`delete` policy for `authenticated`, so every write — including the first one — has to go through the backend's service-role client, exactly like `ai_spend_limit` today.

```sql
-- Global admin flag. Presence of a row = is a global admin. Exactly one
-- admin exists today (the app's owner); there's no self-serve promotion
-- flow, so rows are added by hand via the Supabase SQL editor, not by
-- any application code path.
create table global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table global_admins enable row level security;

-- A user can check whether *they themselves* are an admin (drives the
-- post-login redirect, decision 8) — but cannot see or affect anyone
-- else's row, and cannot write their own into existence.
create policy "a user can check their own admin status"
on global_admins for select to authenticated
using (user_id = (select auth.uid()));

-- One-time, manual — not part of any migration's data, run once by hand:
-- insert into global_admins (user_id)
-- select id from auth.users where email = 'nz.eason.chen@gmail.com';
```

```sql
-- Per-user AI-call access. Replaces ai_spend_limit's singleton row.
-- Absence of a row for a user_id is itself meaningful: "fresh signup,
-- free trial available, never touched." A row only gets created the
-- first time that user either (a) successfully consumes their free
-- trial call, or (b) is granted real credit by an admin — both writes
-- happen from the backend only, matching ai_spend_limit's convention.
--
-- Mode is derived from cap_usd, not stored as a separate enum:
--   cap_usd is null      -> free-trial mode; refuse if free_trial_used
--   cap_usd is not null  -> dollar-cap mode; refuse if spent_usd >= cap_usd
create table user_ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_trial_used boolean not null default false,
  cap_usd numeric(10, 4),
  spent_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_ai_access enable row level security;

-- Read-only for the row's own owner, so the frontend can show "1 free
-- upload available" / "$0.32 of $1.00 used". No write policy for
-- authenticated at all — only the service-role key writes (recognize
-- flow on first successful call, or the admin grant-credit route).
create policy "a user can view their own AI access status"
on user_ai_access for select to authenticated
using (user_id = (select auth.uid()));
```

**Migrating existing users** (decision 9 — grandfather them straight into dollar-cap mode, default $1, skipping the free-trial gate):

```sql
insert into user_ai_access (user_id, free_trial_used, cap_usd, spent_usd)
select user_id, true, 1.00, 0
from profiles
on conflict (user_id) do nothing;
```

**Backend logic sketch** (replaces `api/_lib/spendLimit.ts`'s `getSpendStatus`/`recordSpend`, called from `recognizeReceipt.ts` with the caller's `user_id`):

- Look up the caller's `user_ai_access` row (service-role client, bypasses RLS).
- No row, or `cap_usd is null`: free-trial mode. If `free_trial_used`, refuse (point the user at the `mailto:` admin-contact flow, decision 7). Otherwise allow the call; on success, upsert `{ free_trial_used: true }`.
- `cap_usd is not null`: dollar-cap mode. If `spent_usd >= cap_usd`, refuse (same `mailto:` flow). Otherwise allow; on success, `spent_usd += actualCostUsd` (same read-then-write pattern `recordSpend` already uses — fine at this scale, per its own comment).

**Admin grant-credit operation** (upsert, always resets `spent_usd` to 0 and marks the trial as used, per decision 4's "reset to a fresh allowance" semantics — `$capUsd` defaults to `1.00` for the one-click "Grant $1" action, or any admin-entered custom amount):

```sql
insert into user_ai_access (user_id, free_trial_used, cap_usd, spent_usd, updated_at)
values ($1, true, $2, 0, now())
on conflict (user_id) do update
  set cap_usd = excluded.cap_usd, spent_usd = 0, free_trial_used = true, updated_at = now();
```

**Ban/unban**: no schema change at all — implemented purely through `supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration })`, per decision 5. `auth.users` isn't a table this app defines migrations for.

**`ai_spend_limit`**: left in place as-is, just unreferenced by the code once this ships. Dropping it is a separate, later cleanup migration once the new model has proven out — not bundled into this one, to keep this migration reversible/inspectable on its own.

**Consequences for other tickets**:
- **Ticket 08 (Tech Stack & Storage)** is superseded on the spend-cap point: its "single global hard $1 cap" design is replaced by the per-user model above. Ticket 08's OCR-model choice, backend-proxy requirement, and image-storage decisions are unaffected and still stand.
- **CLAUDE.md**'s "Claude API usage in this app" section states the global cap "must not be relaxed without the user's explicit say-so" — this ticket **is** that explicit say-so, given directly by the project owner across this session's grilling. CLAUDE.md needs updating to reflect the new per-user model when this is implemented.

## Post-launch amendments

- **The admin identity ended up being the same account as the project owner's existing family account** (`nz.eason.chen@gmail.com`), not a separate dedicated admin-only email as briefly considered. That account was already in `global_admins` from the original implementation, so no change was needed there — just confirmed.
- **Added a persistent link back into the admin dashboard**, not just decision 8's one-time post-login redirect: Circle Settings (the account/settings page) now shows a "Go to admin dashboard" link, gated on the same `isGlobalAdmin` check, for whenever a global admin already has a live session (e.g. after a page reload) and the one-time redirect has already fired.
- **Resolved — root cause found, not actually a timing race**: signing up a brand-new account used to intermittently fail to auto-create its circle/profile, insert rejected by RLS as if unauthenticated. Root-caused by reproducing it directly against Postgres (`begin; set local role authenticated; insert into circles (name) values ('x') returning id; ` — fails every time with `new row violates row-level security policy`, no client/JWT involved at all) and bisecting: the same insert *without* `returning` succeeds cleanly. The cause: `circles`' SELECT policy is `id = current_circle_id()`, which resolves via the signer's `profiles` row — a row that doesn't exist yet for a brand-new signer (it's created in the *next* insert). `supabase-js`'s `.insert({}).select().single()` issues `INSERT ... RETURNING`, and RETURNING is itself subject to the table's SELECT policy — with no visible row to return, Postgres fails the whole statement, even though the INSERT's own `with_check(true)` would have allowed it. So it wasn't intermittent at all (confirmed 100% reproducible in isolation) — production just only exercises this path on a genuine new signup, which had only happened rarely. **Fix**: `src/lib/auth.ts` (`signUpWithEmail` and `ensureProfile`) now generates the circle's `id` client-side (`crypto.randomUUID()`) and inserts both the circle and the profile without chaining `.select()`, so the RETURNING-visibility check never triggers.
- **Raised the free trial from 1 call to 5** and told users about it up front. `user_ai_access.free_trial_used boolean` was replaced with `free_trial_calls_used integer` (migration `20260809000001_user_ai_access_trial_count`, backfilling existing rows to `5` if the old boolean was `true`, `0` otherwise); `getAccessStatus`/`recordSuccess` in `api/_lib/userAiAccess.ts` now compare/increment against the exported `FREE_TRIAL_LIMIT` constant instead of flipping a boolean. `grantCredit` sets `free_trial_calls_used = FREE_TRIAL_LIMIT` on every grant (same "graduate out of trial mode for good" intent the boolean previously served). Sign-up now also collects a display name directly (`SignUpForm`'s new field, passed into `signUpWithEmail`) instead of deferring to the email-local-part default — and right after a non-admin signs up, `Auth.tsx` passes `justSignedUp: true` through router state so `Home.tsx` can show a one-time "you have 5 free AI recognitions" welcome message.
