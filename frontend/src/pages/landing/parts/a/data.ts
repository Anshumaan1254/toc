import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AutomatonPayload, AutomatonRecord, DfaPayload } from "@/lib/types";

/** Plain-language note per state (e.g. "suffix ab"), from the automaton's untyped meta. */
export function stateNotes(a: AutomatonPayload | undefined | null): Record<string, string> {
  const raw = a?.meta?.["state_notes"];
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

/** For a subset-construction DFA: the NFA states each DFA state stands for. */
export function subsetsOf(dfa: DfaPayload | undefined | null): Record<string, string[]> {
  const raw = dfa?.meta?.["subsets"];
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export const isDfa = (a: AutomatonPayload | undefined | null): a is DfaPayload => !!a && a.kind === "dfa";

/**
 * Several ground-truth DFAs at once. Shares the cache key of useAutomaton(lang, "dfa"),
 * so other sections that ask for the same automaton reuse the response.
 */
export function useTruthDfas(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["automaton", id, "dfa"],
      queryFn: () => api.automaton(id, "dfa"),
      staleTime: Infinity,
    })),
    combine: (results) => {
      const byId: Record<string, DfaPayload> = {};
      results.forEach((r, i) => {
        const rec = r.data as AutomatonRecord | undefined;
        if (rec && isDfa(rec.automaton)) byId[ids[i]] = rec.automaton;
      });
      const firstError = results.find((r) => r.error)?.error ?? null;
      return {
        byId,
        isPending: results.some((r) => r.isPending),
        error: firstError,
        refetch: () => results.forEach((r) => r.error && r.refetch()),
      };
    },
  });
}

/** Binary string (MSB first) to its value; empty string = 0. */
export function binaryValue(s: string): number {
  let v = 0;
  for (const c of s) v = v * 2 + (c === "1" ? 1 : 0);
  return v;
}
