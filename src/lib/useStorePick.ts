import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ReceiptDraft } from "@/lib/receipts";
import { listStores, type Store, type StoreChoice } from "@/lib/stores";
import { initialStorePick, pickHasChain, storeChoiceFromPick, type StorePick } from "@/lib/storePick";

export interface StorePickState {
  // The Circle's Stores, for the picker's options.
  stores: Store[];
  // What the picker holds; null until start.
  pick: StorePick | null;
  setPick: (pick: StorePick) => void;
  // The chain/branch the pick names, which confirming or saving sends.
  choice: StoreChoice | null;
  // Whether the pick names a chain — Confirm and Save are disabled until it does.
  hasChain: boolean;
  // Loads the Circle's Stores (RLS scopes the read to the caller's Circle).
  load: () => Promise<Store[]>;
  // Starts the picker on a receipt — on the Stores just loaded, when given,
  // since a load's result isn't in state until the next render.
  start: (draft: ReceiptDraft, loadedStores?: Store[]) => void;
}

// The store picker's wiring, shared by the preview screen and a confirmed
// receipt's edit mode (issue 29): the Circle's Stores, the pick, and what
// it names.
export function useStorePick(): StorePickState {
  const [stores, setStores] = useState<Store[]>([]);
  const [pick, setPick] = useState<StorePick | null>(null);

  async function load(): Promise<Store[]> {
    const loaded = await listStores(supabase);
    setStores(loaded);
    return loaded;
  }

  function start(draft: ReceiptDraft, loadedStores: Store[] = stores) {
    setPick(initialStorePick(loadedStores, draft));
  }

  return {
    stores,
    pick,
    setPick,
    choice: storeChoiceFromPick(stores, pick),
    hasChain: pickHasChain(stores, pick),
    load,
    start,
  };
}
