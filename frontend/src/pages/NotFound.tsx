import { Link } from "react-router";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import type { DfaPayload } from "@/lib/types";

const TRAP: DfaPayload = {
  kind: "dfa", alphabet: ["?"], states: ["here", "trap"], start: "here", accepting: [],
  transitions: { here: { "?": "trap" }, trap: { "?": "trap" } }, num_states: 2, num_transitions: 2, complete: true, meta: {},
};

export default function NotFound() {
  return (
    <section className="grid-paper mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center gap-6 px-6 pt-28 text-center">
      <div className="w-full max-w-sm">
        <AutomatonGraph automaton={TRAP} active={["trap"]} verdict="reject" zoomable={false} maxHeight={160} ariaLabel="A trap state: no way back" />
      </div>
      <h1 className="font-display text-5xl font-semibold">This path leads to a trap state</h1>
      <p className="max-w-md text-ink-2">No transition from here reaches an accepting page. Start again from the story or pick a language to explore.</p>
      <div className="flex gap-3">
        <Link to="/" className="rounded-full bg-lamp px-5 py-2.5 font-medium text-[#1a1203]">Back to the story</Link>
        <Link to="/explore" className="rounded-full border border-line-strong px-5 py-2.5 font-medium text-ink">Explore the models</Link>
      </div>
    </section>
  );
}
