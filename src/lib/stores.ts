import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { BilingualName } from "@/lib/bilingualName";
import { storeName } from "@/lib/storeName";

// The normalized match keys for a Store, stored as stores.chain_key /
// stores.branch_key. Matching is exact on these keys, so everything that
// should count as "the same branch" has to collapse to the same string here.
export interface StoreKey {
  chainKey: string;
  // Null means branch unknown: its own Store, never matched to a named branch.
  branchKey: string | null;
}

// Street-type abbreviations, spelled out so "Smith St" and "Smith Street"
// key alike. "St" also abbreviates Saint ("St Lukes"); that's harmless, since
// it's expanded the same way wherever it's printed.
const STREET_ABBREVIATIONS: Record<string, string> = {
  rd: "road",
  st: "street",
  ave: "avenue",
  dr: "drive",
};

function normalize(text: string): string {
  return (
    text
      // Decompose ā into a + combining macron, then drop the mark.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // "D.H." and "DH", "Rd." and "Rd" are the same thing printed differently.
      .replace(/\./g, "")
      .replace(/[-–—,/]/g, " ")
      .replace(/\b(rd|st|ave|dr)\b/g, (_, abbreviation: string) => STREET_ABBREVIATIONS[abbreviation])
      .trim()
      .replace(/\s+/g, " ")
  );
}

// Chain names that changed over time, keyed by their normalized form. The
// Countdown -> Woolworths rebrand finished in December 2025, so one physical
// branch appears under both names in any multi-year history. Also catches a
// chain's known alternative spellings.
const CHAIN_ALIASES: Record<string, string> = {
  countdown: "woolworths",
  "pak n save": "pak'nsave",
};

export function storeKey(chainEn: string, branchEn: string): StoreKey {
  const chain = normalize(chainEn);
  return { chainKey: CHAIN_ALIASES[chain] ?? chain, branchKey: normalize(branchEn) || null };
}

// A name on its way in, not read back: zh is null when there's no
// Translation, and is stored as null. Distinct from BilingualName, whose zh
// is never blank — filling it in here would write the Source Text into the
// _zh column as if it were a Translation.
export interface BilingualText {
  en: string;
  zh: string | null;
}

// A Store named by its chain and branch, as a page picks or types it — what
// resolveStore takes. An empty branch means branch unknown.
export interface StoreChoice {
  chain: BilingualText;
  branch: BilingualText;
}

// A StoreChoice's branch when the branch is unknown.
export const UNKNOWN_BRANCH_NAME: BilingualText = { en: "", zh: null };

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
    branch: { en: store.branchNameEn ?? "", zh: store.branchNameZh },
  };
}

// A Store's name as one line — chain, then branch if it has one.
export function storeNameOf(store: Store): BilingualName {
  return storeName({
    chain_name_en: store.chainNameEn,
    chain_name_zh: store.chainNameZh,
    branch_name_en: store.branchNameEn,
    branch_name_zh: store.branchNameZh,
  });
}

// The existing Store a chain/branch pair names, compared by the same
// normalized keys resolveStore matches on.
export function matchingStore(
  stores: Store[],
  { chain, branch }: StoreChoice
): Store | undefined {
  const wanted = storeKey(chain.en, branch.en);
  return stores.find((store) => {
    const key = storeKey(store.chainNameEn, store.branchNameEn ?? "");
    return key.chainKey === wanted.chainKey && key.branchKey === wanted.branchKey;
  });
}

// The candidates for a near-miss: every Store of the same chain, for the
// user to pick from when the branch matched none of them. Deliberately no
// closer guess than the chain (ticket 29: the human confirmation step is
// load-bearing).
export function nearMissStores(stores: Store[], { chain }: StoreChoice): Store[] {
  const { chainKey } = storeKey(chain.en, "");
  return stores.filter((store) => storeKey(store.chainNameEn, "").chainKey === chainKey);
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
// has never seen that branch.
export async function resolveStore(
  client: SupabaseClient<Database>,
  circleId: string,
  { chain, branch }: StoreChoice
): Promise<Store> {
  const { chainKey, branchKey } = storeKey(chain.en, branch.en);
  const chainStores = client
    .from("stores")
    .select(STORE_SELECT)
    .eq("circle_id", circleId)
    .eq("chain_key", chainKey);
  // `eq` with null never matches in PostgREST: an unknown branch needs `is`.
  const { data: existing, error: lookupError } = await (
    branchKey === null
      ? chainStores.is("branch_key", null)
      : chainStores.eq("branch_key", branchKey)
  ).maybeSingle();
  if (lookupError) {
    throw lookupError;
  }
  if (existing) {
    return toStore(existing);
  }

  // Known limitation: two members confirming the same new branch at the same
  // moment both miss the lookup, and the second insert fails on
  // stores_circle_chain_branch_key (23505) instead of returning the first's
  // row. Rare enough in a family circle to leave unhandled for now.
  const { data: created, error: insertError } = await client
    .from("stores")
    .insert({
      circle_id: circleId,
      chain_name_en: chain.en.trim(),
      chain_name_zh: chain.zh?.trim() ?? null,
      // An unknown branch has no name in either language; the stores check
      // constraint requires branch_name_en and branch_key to be null together.
      branch_name_en: branchKey === null ? null : branch.en.trim(),
      branch_name_zh: branchKey === null ? null : (branch.zh?.trim() ?? null),
      chain_key: chainKey,
      branch_key: branchKey,
    })
    .select(STORE_SELECT)
    .single();
  if (insertError) {
    throw insertError;
  }
  return toStore(created);
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
