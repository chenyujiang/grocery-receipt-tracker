import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// A replay-and-record stand-in for supabase-js, shared by every test that
// crosses the Supabase boundary — the browser client (`@/lib/supabaseClient`)
// and the service-role one (`api/_lib/supabaseAdmin`) alike.
//
// It records calls and replays prepared results. It deliberately does NOT
// filter, sort, or resolve embeds: doing so would mean parsing PostgREST's
// select syntax (two-level nesting, `!inner`, and filtering through an embed
// all appear in production), and the rows a test wants are already in
// post-embed shape. The line is shape and bookkeeping, not semantics — so
// `.single()` gets no special treatment either. See issue 18.
//
// This module owns the codebase's single `as unknown as SupabaseClient` cast.
// If you find yourself adding another one in a test file, the fake is missing
// something — extend it here instead.

/** One recorded chain call: the method name followed by its arguments. */
export type RecordedCall = [string, ...unknown[]];

/** Whatever awaiting a query resolves to — `data`/`error`, or `count` for a head request. */
export type PreparedResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
  status?: number;
  statusText?: string;
};

/** A table's prepared results: a queue consumed in order, or one value reused by every call. */
type TableResults = PreparedResult | PreparedResult[];

export type FakeSupabaseOptions = {
  /** Results for `from(table)`, keyed by table name. */
  tables?: Record<string, TableResults>;
  /** Results for `auth.*`, keyed by method name; `admin` nests the service-role ones. */
  auth?: Record<string, unknown> & { admin?: Record<string, unknown> };
  /** Results for the operations on `storage.from(bucket)`, keyed by operation name. */
  storage?: Record<string, unknown>;
  /** Results for `rpc(name, args)`, keyed by function name. */
  rpc?: Record<string, PreparedResult>;
};

const AUTH_DEFAULTS: Record<string, unknown> = {
  getUser: { data: { user: null }, error: null },
  getSession: { data: { session: null }, error: null },
  signUp: { data: { user: null, session: null }, error: null },
  signInWithPassword: { data: { user: null, session: null }, error: null },
  signOut: { error: null },
};

const ADMIN_AUTH_DEFAULTS: Record<string, unknown> = {
  listUsers: { data: { users: [] }, error: null },
  updateUserById: { data: { user: null }, error: null },
  getUserById: { data: { user: null }, error: null },
  createUser: { data: { user: null }, error: null },
  deleteUser: { data: { user: null }, error: null },
};

const STORAGE_OPERATIONS = ["remove", "upload", "download", "createSignedUrl"];

function resolvedSpy(value: unknown) {
  return vi.fn().mockResolvedValue(value);
}

function spyBag(defaults: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const bag: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of new Set([...Object.keys(defaults), ...Object.keys(overrides)])) {
    bag[name] = resolvedSpy(name in overrides ? overrides[name] : defaults[name]);
  }
  return bag;
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const tables = options.tables ?? {};
  const calls = new Map<string, RecordedCall[]>();
  const consumed = new Map<string, number>();

  function nextResult(table: string): PreparedResult {
    const prepared = tables[table];
    const callIndex = (consumed.get(table) ?? 0) + 1;
    consumed.set(table, callIndex);

    if (prepared === undefined) {
      throw new Error(
        `fakeSupabase: no prepared result for from("${table}"). ` +
          `Add it: createFakeSupabase({ tables: { ${table}: { data: [], error: null } } })`
      );
    }
    if (!Array.isArray(prepared)) {
      return prepared;
    }
    if (callIndex > prepared.length) {
      throw new Error(
        `fakeSupabase: from("${table}") was called ${callIndex} time(s), ` +
          `but only ${prepared.length} result(s) were prepared for it.`
      );
    }
    return prepared[callIndex - 1];
  }

  // Recorded through a Proxy rather than a fixed method list, so the fake
  // never has to be extended just because production reaches for another
  // PostgREST filter.
  function buildQuery(table: string, result: PreparedResult): unknown {
    const record = (call: RecordedCall) => {
      const existing = calls.get(table) ?? [];
      existing.push(call);
      calls.set(table, existing);
    };

    const query: unknown = new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property === "symbol") {
            return undefined;
          }
          if (property === "then") {
            // Awaiting the chain is what resolves the query — supabase-js's
            // builder is thenable, with no separate execute step.
            return (
              resolve: (value: PreparedResult) => unknown,
              reject?: (reason: unknown) => unknown
            ) => Promise.resolve(result).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            record([property, ...args]);
            return query;
          };
        },
      }
    );
    return query;
  }

  const from = vi.fn((table: string) => buildQuery(table, nextResult(table)));

  const { admin: adminOverrides, ...authOverrides } = options.auth ?? {};
  const auth = spyBag(AUTH_DEFAULTS, authOverrides);
  const adminAuth = spyBag(ADMIN_AUTH_DEFAULTS, adminOverrides ?? {});
  // Synchronous, unlike the rest of auth: it returns an unsubscribe handle.
  auth.onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));

  const storageOverrides = options.storage ?? {};
  const bucketOperations: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of new Set([...STORAGE_OPERATIONS, ...Object.keys(storageOverrides)])) {
    bucketOperations[name] = resolvedSpy(
      name in storageOverrides ? storageOverrides[name] : { data: null, error: null }
    );
  }
  const storageFrom = vi.fn(() => bucketOperations);

  const preparedRpc = options.rpc ?? {};
  const rpc = vi.fn(async (name: string) => {
    if (!(name in preparedRpc)) {
      throw new Error(
        `fakeSupabase: no prepared result for rpc("${name}"). ` +
          `Add it: createFakeSupabase({ rpc: { ${name}: { data: null, error: null } } })`
      );
    }
    return preparedRpc[name];
  });

  const client = {
    from,
    rpc,
    auth: { ...auth, admin: adminAuth },
    storage: { from: storageFrom },
  };

  return {
    /** Pass this where a real Supabase client is expected. */
    client: client as unknown as SupabaseClient<Database>,
    from,
    rpc,
    /** The `auth.*` spies, including `onAuthStateChange`. */
    auth,
    /** The `auth.admin.*` spies, for service-role tests. */
    adminAuth,
    /** The spy for `storage.from(bucket)` itself — assert the bucket name on it. */
    storageFrom,
    /** The spies for operations on a bucket (`remove`, `upload`, …). */
    storage: bucketOperations,
    /**
     * Every chained call made against `table`, flattened across repeated
     * queries. Assert with `toContainEqual` — containment, not equality, is
     * what keeps a test from breaking when two filters swap places.
     */
    callsFor(table: string): RecordedCall[] {
      return calls.get(table) ?? [];
    },
  };
}
