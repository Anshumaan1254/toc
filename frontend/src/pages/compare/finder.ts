import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { randomString } from "@/lib/automata";
import type { Approach, Language } from "@/lib/types";

const BUDGET_MS = 3000;
const RANDOM_TRIES = 8;

export type FinderState = { status: "idle" } | { status: "searching" } | { status: "none"; language: string };

/** Resolves to null when `ms` runs out first, so one slow request cannot hold the search past its budget. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), Math.max(0, ms)))]);
}

/**
 * "Find a string they disagree on": tries the known counterexamples of every learned automaton that is
 * not equivalent to the ground truth, then a handful of long random strings, and hands back the first one
 * on which some approach disagrees with the ground truth. Gives up after three seconds.
 */
export function useDisagreementFinder(language: Language, approaches: Approach[] | undefined, current: string | null, onFound: (s: string) => void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FinderState>({ status: "idle" });
  const token = useRef(0);

  // A new language or a new string on screen makes an old "none found" message stale.
  useEffect(() => {
    token.current += 1;
    setState({ status: "idle" });
  }, [language.id, current]);

  const find = useCallback(async () => {
    const mine = ++token.current;
    const deadline = performance.now() + BUDGET_MS;
    const left = () => deadline - performance.now();
    setState({ status: "searching" });

    const learned = (approaches ?? []).filter((a) => a.family === "learned" && a.kind !== "ml" && a.available && a.stats.equivalent_to_truth === false);
    const records = await within(
      Promise.allSettled(
        learned.map((a) =>
          queryClient.fetchQuery({ queryKey: ["automaton", language.id, a.id], queryFn: () => api.automaton(language.id, a.id), staleTime: Infinity }),
        ),
      ),
      left(),
    );
    const counterexamples: string[] = [];
    for (const r of records ?? []) {
      if (r.status !== "fulfilled") continue;
      // ε is "", so test the type rather than truthiness.
      const v = r.value.stats?.counterexample_to_truth ?? r.value.metrics?.counterexample_to_truth;
      if (typeof v === "string") counterexamples.push(v);
    }
    // Longest first: a five-symbol counterexample makes the point better than ε.
    counterexamples.sort((a, b) => b.length - a.length);
    const randoms = Array.from({ length: RANDOM_TRIES }, () => randomString(language.alphabet, 21 + Math.floor(Math.random() * 16)));
    // The string already on screen goes last, so a second press moves on to something new.
    const candidates = [...new Set([...counterexamples, ...randoms])].sort((a, b) => Number(a === current) - Number(b === current));

    for (const s of candidates) {
      if (token.current !== mine) return;
      if (left() <= 0) break;
      try {
        const result = await within(api.compare(language.id, s), left());
        if (token.current !== mine) return;
        if (result && result.disagreements.length > 0) {
          setState({ status: "idle" });
          onFound(s);
          // onFound changes the link, which resets the state above; keep this search from being cancelled by it.
          return;
        }
      } catch {
        // One failed request is not a verdict; try the next candidate.
      }
    }
    if (token.current === mine) setState({ status: "none", language: language.id });
  }, [approaches, current, language, onFound, queryClient]);

  return { state, find };
}
