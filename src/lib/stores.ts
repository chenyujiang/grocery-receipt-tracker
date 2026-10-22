import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { BilingualName } from "@/lib/bilingualName";
import { isKnownBranch, storeName, type StoreNames } from "@/lib/storeName";
import { chainKey, storeKey } from "@/lib/storeKey";

// A name on its way in, not read back: zh is null when there's no
// Translation, and is stored as null. Distinct from BilingualName, whose zh
// is never blank — filling it in here would write the Source Text into the
// _zh column as if it were a Translation.
export interface BilingualText {
  en: string;
  zh: string | null;
}

// A Store named by its chain and branch, as a page picks or types it — what
// resolveStore takes. A null branch means branch unknown, as on a Store.
export interface StoreChoice {
  chain: BilingualText;
  branch: BilingualText | null;
}

// A receipt's Store as read off it: what the AI read; else — a draft saved
// before the chain/branch split — its header as the chain, branch unknown,
// the same Store the backfill gives an old receipt. Where the store picker's
// fields start, and, behind a receipt's own Store, where the picker starts.
export function storeAsRead(receipt: {
  recognizedStore: StoreChoice | null;
  receiptHeader: BilingualText;
}): StoreChoice {
  return receipt.recognizedStore ?? { chain: receipt.receiptHeader, branch: null };
}

// A Store as the app sees it: one branch of one chain, in one Circle.
export interface Store {
  id: string;
  chainNameEn: string;
  chainNameZh: string | null;
  branchNameEn: string | null;
  branchNameZh: string | null;
}

// A Store as the chain/branch names resolveStore takes — what a page passes
// to confirm or edit a receipt at that Store.
export function storeChoiceOf(store: Store): StoreChoice {
  return {
    chain: { en: store.chainNameEn, zh: store.chainNameZh },
    branch: isKnownBranch(store.branchNameEn)
      ? { en: store.branchNameEn, zh: store.branchNameZh }
      : null,
  };
}

// A chain/branch pair from its four name columns — a Store's, or what the AI
// read — with an unknown branch (isKnownBranch) as null.
export function storeChoiceOfNames(names: StoreNames): StoreChoice {
  return {
    chain: { en: names.chain_name_en, zh: names.chain_name_zh },
    branch: isKnownBranch(names.branch_name_en)
      ? { en: names.branch_name_en, zh: names.branch_name_zh }
      : null,
  };
}

function storeNamesOf(store: Store): StoreNames {
  return {
    chain_name_en: store.chainNameEn,
    chain_name_zh: store.chainNameZh,
    branch_name_en: store.branchNameEn,
    branch_name_zh: store.branchNameZh,
  };
}

// A Store's name as one line — chain, then branch if it has one.
export function storeNameOf(store: Store): BilingualName {
  return storeName(storeNamesOf(store));
}

// Whether a chain/branch pair names a chain at all — a Store with no chain
// would show up blank in every member's picker, so resolveStore refuses one.
export function hasChain({ chain }: StoreChoice): boolean {
  return chainKey(chain.en) !== "";
}

// Whether two chain/branch pairs name the same Store, compared by the same
// normalized keys resolveStore matches on.
export function sameStoreKey(a: StoreChoice, b: StoreChoice): boolean {
  const aKey = storeKey(a.chain.en, a.branch?.en ?? null);
  const bKey = storeKey(b.chain.en, b.branch?.en ?? null);
  return aKey.chainKey === bKey.chainKey && aKey.branchKey === bKey.branchKey;
}

// A chain/branch pair's name as one line, the way storeNameOf names a Store —
// trimmed, since what the AI read can carry OCR's stray spaces. Whether it
// names a branch at all is storeName's to decide (isKnownBranch).
export function storeChoiceName({ chain, branch }: StoreChoice): BilingualName {
  return storeName({
    chain_name_en: chain.en.trim(),
    chain_name_zh: chain.zh,
    branch_name_en: branch?.en.trim() ?? null,
    branch_name_zh: branch?.zh ?? null,
  });
}

// The existing Store a chain/branch pair names.
export function matchingStore(stores: Store[], choice: StoreChoice): Store | undefined {
  return stores.find((store) => sameStoreKey(storeChoiceOf(store), choice));
}

// The candidates for a near-miss: every Store of the same chain, for the
// user to pick from when the branch matched none of them. Deliberately no
// closer guess than the chain (ticket 29: the human confirmation step is
// load-bearing).
export function nearMissStores(stores: Store[], { chain }: StoreChoice): Store[] {
  const key = chainKey(chain.en);
  return stores.filter((store) => chainKey(store.chainNameEn) === key);
}

const STORE_SELECT = "id, chain_name_en, chain_name_zh, branch_name_en, branch_name_zh";

function toStore(
  row: Pick<
    Database["public"]["Tables"]["stores"]["Row"],
    "id" | "chain_name_en" | "chain_name_zh" | "branch_name_en" | "branch_name_zh"
  >
): Store {
  return {
    id: row.id,
    chainNameEn: row.chain_name_en,
    chainNameZh: row.chain_name_zh,
    branchNameEn: row.branch_name_en,
    branchNameZh: row.branch_name_zh,
  };
}

// Finds the Circle's Store for a chain/branch pair, matching on the
// normalized keys rather than the printed text, and creates it if the Circle
// has never seen that branch — saying which, so a caller whose later writes
// fail can take back a Store it created (deleteUnusedStore).
export async function resolveStore(
  client: SupabaseClient<Database>,
  circleId: string,
  choice: StoreChoice
): Promise<{ store: Store; created: boolean }> {
  if (!hasChain(choice)) {
    throw new Error("Enter the store's chain name");
  }
  const { chain, branch } = choice;
  const key = storeKey(chain.en, branch?.en ?? null);
  const chainStores = client
    .from("stores")
    .select(STORE_SELECT)
    .eq("circle_id", circleId)
    .eq("chain_key", key.chainKey);
  // `eq` with null never matches in PostgREST: an unknown branch needs `is`.
  const { data: existing, error: lookupError } = await (
    key.branchKey === null
      ? chainStores.is("branch_key", null)
      : chainStores.eq("branch_key", key.branchKey)
  ).maybeSingle();
  if (lookupError) {
    throw lookupError;
  }
  if (existing) {
    return { store: toStore(existing), created: false };
  }

  // Known limitation: two members confirming the same new branch at the same
  // moment both miss the lookup, and the second insert fails on
  // stores_circle_chain_branch_key (23505) instead of returning the first's
  // row. Rare enough in a family circle to leave unhandled for now. The
  // same goes for the reverse: if a confirm that created a Store fails and
  // takes it back (deleteUnusedStore) just after another member's lookup
  // found it, that member's confirm then fails on the missing Store, and a
  // retry creates it afresh.
  // An unknown branch has no name; the stores check constraint requires
  // branch_name_en and branch_key to be null together. Store names are shown
  // in English only, so a Translation the AI read is not stored: the _zh
  // columns stay null and every name falls back to its Source Text.
  const namedBranch = key.branchKey === null ? null : branch;
  const { data: created, error: insertError } = await client
    .from("stores")
    .insert({
      circle_id: circleId,
      chain_name_en: chain.en.trim(),
      chain_name_zh: null,
      branch_name_en: namedBranch?.en.trim() ?? null,
      branch_name_zh: null,
      chain_key: key.chainKey,
      branch_key: key.branchKey,
    })
    .select(STORE_SELECT)
    .single();
  if (insertError) {
    throw insertError;
  }
  return { store: toStore(created), created: true };
}

// Deletes a Store no receipt points at; RLS refuses one with any history.
export async function deleteUnusedStore(client: SupabaseClient<Database>, storeId: string): Promise<void> {
  const { error } = await client.from("stores").delete().eq("id", storeId);
  if (error) {
    throw error;
  }
}

// The Circle's Stores for the store picker (RLS scopes the read to the
// caller's Circle). Sorted by chain, then branch, with a chain's
// unknown-branch Store last — sorted on the keys, so a casing difference in
// the printed names never splits a chain apart in the list.
export async function listStores(client: SupabaseClient<Database>): Promise<Store[]> {
  const { data, error } = await client
    .from("stores")
    .select(`${STORE_SELECT}, chain_key, branch_key`);
  if (error) {
    throw error;
  }
  return [...(data ?? [])]
    .sort(
      (a, b) =>
        a.chain_key.localeCompare(b.chain_key) ||
        (a.branch_key === null ? 1 : 0) - (b.branch_key === null ? 1 : 0) ||
        (a.branch_key ?? "").localeCompare(b.branch_key ?? "")
    )
    .map(toStore);
}
