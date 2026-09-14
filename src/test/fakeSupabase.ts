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

// Every surface runs dry the same way: what a test did not prepare, it did
// not anticipate, so the fake says so rather than inventing an answer. A
// silent signed-out default or an empty `{ data: null, error: null }` turns
// "production asked a question this test never set up" — usually a real
// regression — into a mystery failure somewhere downstream.
function spyBag(
  kind: string,
  prepared: Record<string, unknown>,
  extras: Record<string, ReturnType<typeof vi.fn>> = {}
) {
  const bag: Record<string, ReturnType<typeof vi.fn>> = { ...extras };

  function ensure(name: string) {
    if (!(name in bag)) {
      bag[name] =
        name in prepared
          ? vi.fn().mockResolvedValue(prepared[name])
          : vi.fn(() =>
              // Rejects rather than throwing synchronously: supabase-js always
              // hands back a promise, so production's `await` is the thing
              // that should surface this.
              Promise.reject(
                new Error(
                  `fakeSupabase: no prepared result for ${kind}.${name}(). ` +
                    `Add it: createFakeSupabase({ ${kind.split(".")[0]}: { ${name}: ... } })`
                )
              )
            );
    }
    return bag[name];
  }

  for (const name of Object.keys(prepared)) {
    ensure(name);
  }

  // A Proxy, not a fixed list: an unprepared method still has to hand back a
  // spy — and the *same* spy on every read, so `.mock.calls` survives — it
  // just has to be one that throws when called.
  return new Proxy(bag, {
    get(_target, property) {
      if (typeof property === "symbol") {
        return Reflect.get(bag, property);
      }
      return ensure(property);
    },
  }) as Record<string, ReturnType<typeof vi.fn>>;
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const tables = options.tables ?? {};
  const queries = new Map<string, RecordedCall[][]>();
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
        `fakeSupabase: from("${table}") was awaited ${callIndex} time(s), ` +
          `but only ${prepared.length} result(s) were prepared for it.`
      );
    }
    return prepared[callIndex - 1];
  }

  // Recorded through a Proxy rather than a fixed method list, so the fake
  // never has to be extended just because production reaches for another
  // PostgREST filter.
  function buildQuery(table: string): unknown {
    const recorded: RecordedCall[] = [];
    queries.set(table, [...(queries.get(table) ?? []), recorded]);

    // Keyed to the await, not to `from()`: a builder that is constructed and
    // then abandoned must not eat a queue slot. Memoised, so awaiting one
    // builder twice is still one query.
    let settled: PreparedResult | undefined;
    let hasSettled = false;
    const resolveOnce = () => {
      if (!hasSettled) {
        settled = nextResult(table);
        hasSettled = true;
      }
      return settled as PreparedResult;
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
            ) => new Promise<PreparedResult>((ok) => ok(resolveOnce())).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            recorded.push([property, ...args]);
            return query;
          };
        },
      }
    );
    return query;
  }

  const from = vi.fn((table: string) => buildQuery(table));

  const { admin: adminOverrides, ...authOverrides } = options.auth ?? {};
  // Synchronous, unlike the rest of auth, and every mount subscribes — so it
  // keeps a default where the others deliberately have none.
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));
  const auth = spyBag("auth", authOverrides, { onAuthStateChange });
  const adminAuth = spyBag("auth.admin", adminOverrides ?? {});
  const clientAuth = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "admin") {
          return adminAuth;
        }
        if (typeof property === "symbol") {
          return undefined;
        }
        return auth[property as string];
      },
    }
  );

  const bucketOperations = spyBag("storage", options.storage ?? {});
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
    auth: clientAuth,
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
      return (queries.get(table) ?? []).flat();
    },
    /**
     * The same calls, grouped one array per query, in the order the queries
     * were built. Reach for this when a table is read or written more than
     * once and the pairing matters — which filter went with which write —
     * rather than re-deriving it from adjacency in `callsFor`.
     */
    queriesFor(table: string): RecordedCall[][] {
      return queries.get(table) ?? [];
    },
  };
}

/**
 * Build a fake and copy it onto an already-mocked client module.
 *
 * `vi.mock` is hoisted and stays at the top of each test file — it is the
 * line that declares why this test gets a fake at all, so hiding it would
 * make that harder to trace. This just fills the empty object that factory
 * returned, which is what keeps the call sites free of casts:
 *
 *     vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
 *     const db = installFakeSupabase(supabase, { tables: { receipts: [] } });
 */
export function installFakeSupabase(
  client: SupabaseClient<Database>,
  options: FakeSupabaseOptions = {}
) {
  const fake = createFakeSupabase(options);
  Object.assign(client, fake.client);
  return fake;
}
