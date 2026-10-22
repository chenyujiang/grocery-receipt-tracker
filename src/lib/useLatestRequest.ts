import { useCallback, useEffect, useRef } from "react";

// Ticket 31: a page that loads asynchronously must drop a response that lands
// after it stopped caring — the user moved to another product, picked another
// month, re-submitted a filter, or left the page — so a slow, stale response
// can't overwrite the current one.
//
// The returned `start()` begins one request. Starting another supersedes
// every earlier one, and so does unmounting, so "latest wins" holds for
// effect re-runs and imperative reloads alike. Wrap each callback that
// touches state in `guard`, which makes it a no-op once superseded; `cancel`
// supersedes the request explicitly (return it from an effect).
//
// One hook instance tracks one stream of requests. A page with two
// independent loads (say, its data and a dropdown's options) uses two.
export interface LatestRequest {
  guard: <A extends unknown[], R>(callback: (...args: A) => R) => (...args: A) => R | undefined;
  cancel: () => void;
}

export function useLatestRequest(): () => LatestRequest {
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  return useCallback(() => {
    generation.current += 1;
    const mine = generation.current;
    const isCurrent = () => generation.current === mine;
    return {
      guard:
        <A extends unknown[], R>(callback: (...args: A) => R) =>
        (...args: A) =>
          isCurrent() ? callback(...args) : undefined,
      cancel: () => {
        if (isCurrent()) {
          generation.current += 1;
        }
      },
    };
  }, []);
}
