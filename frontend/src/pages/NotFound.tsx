import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useReducedMotion } from "motion/react";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import type { DfaPayload } from "@/lib/types";

const TRAP: DfaPayload = {
  kind: "dfa",
  alphabet: ["?"],
  states: ["here", "trap"],
  start: "here",
  accepting: [],
  transitions: { here: { "?": "trap" }, trap: { "?": "trap" } },
  num_states: 2,
  num_transitions: 2,
  complete: true,
  meta: {},
};

export default function NotFound() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [lap, setLap] = useState(0);
  // A trap state never lets go: a slow token keeps circling its self-loop.
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setLap((n) => n + 1), 1700);
    return () => window.clearInterval(t);
  }, [reduce]);
  const unknownLanguage = pathname.match(/^\/explore\/(L\d+)/i)?.[1];

  return (
    <section className="grid-paper mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center gap-6 px-6 pt-28 text-center">
      <div className="w-full max-w-sm">
        <AutomatonGraph
          automaton={TRAP}
          active={["trap"]}
          activeEdge={reduce ? null : { from: "trap", to: "trap" }}
          tokenKey={lap}
          tokenMs={1300}
          verdict="reject"
          zoomable={false}
          maxHeight={160}
          ariaLabel="A trap state: every symbol leads back to it"
        />
      </div>
      <h1 className="t-page text-ink">This path leads to a trap state</h1>
      <p className="max-w-md text-ink-2">
        {unknownLanguage ? (
          <>
            There is no {unknownLanguage.toUpperCase()}. There are ten languages, L1 to L10.{" "}
            <Link to="/explore" className="text-ink underline decoration-[color:var(--line-strong)] underline-offset-4 hover:decoration-current">
              Pick one in the explorer
            </Link>
            .
          </>
        ) : (
          "No transition from here reaches an accepting page. Start again from the story or pick a language to explore."
        )}
      </p>
      <div className="flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row">
        <Link to="/" className="rounded-full bg-lamp px-5 py-2.5 text-center font-medium text-[#1a1203]">
          Back to the story
        </Link>
        <Link to="/explore" className="rounded-full border border-line-strong px-5 py-2.5 text-center font-medium text-ink">
          Explore the models
        </Link>
      </div>
    </section>
  );
}
