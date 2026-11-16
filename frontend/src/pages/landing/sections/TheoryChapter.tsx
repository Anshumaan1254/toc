import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Term } from "@/components/ui/Term";
import { api, useAutomaton } from "@/lib/api";
import type { ApproachId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLiveGate, useMediaQuery, useRefreshOnResize } from "../parts/a/hooks";
import { DfaStage, MinimizeStage, NfaStage, ProductStage, PumpStage, SubsetStage, SuffixStage, type StageProps } from "../parts/a/theory/stages";
import { CropMarks, InlineSkeleton } from "../parts/a/ui";

/** Every automaton the stages draw; prefetched together when the chapter comes near. */
const NEEDED: [string, ApproachId][] = [
  ["L7", "dfa"],
  ["L7", "nfa"],
  ["L1", "nfa"],
  ["L9", "nfa"],
  ["L8", "min_dfa"],
  ["L7", "rpni"],
  ["L6", "dfa"],
];

interface Step {
  id: string;
  title: string;
  body: ReactNode;
  Stage: ComponentType<StageProps>;
  label: string;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-panel-2/80 px-1 py-px font-mono text-[0.92em] text-ink">{children}</code>;
}

/** Facts quoted in the text, read from the same API responses the drawings use. */
function useFacts() {
  const l8 = useAutomaton("L8", "min_dfa");
  const rpni = useAutomaton("L7", "rpni");
  const l7 = useAutomaton("L7", "dfa");
  const l9 = useAutomaton("L9", "nfa");
  const min = l8.data?.minimization;
  const sc = l9.data?.subset_construction;
  const sep = l7.data?.distinguishing_suffixes?.find((r) => r.suffix !== "");
  return {
    l8: min ? { before: min.states_before, after: min.states_after, rounds: Math.max(0, min.moore_rounds.length - 1) } : null,
    cex: rpni.data ? (rpni.data.metrics?.counterexample_to_truth ?? null) : undefined,
    sep: sep ?? null,
    l9: sc && l9.data ? { nfa: l9.data.automaton.states.length, dfa: sc.dfa.states.length } : null,
  };
}

/**
 * Theory in motion: the left column walks through seven ideas; the drawing on the right is
 * sticky and switches to the matching live automaton (real ones from the API) as each idea
 * crosses the middle of the screen. Small screens get each drawing inline instead.
 */
export function TheoryChapter() {
  const sectionRef = useRef<HTMLElement>(null);
  const near = useInView(sectionRef, { margin: "800px 0px 800px 0px" });
  const wide = useMediaQuery("(min-width: 1024px)");
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const queryClient = useQueryClient();
  const facts = useFacts();
  useRefreshOnResize(sectionRef);

  // Prefetch every automaton once the chapter is close, so switching drawings never waits.
  useEffect(() => {
    if (!near) return;
    for (const [lang, approach] of NEEDED) {
      void queryClient.prefetchQuery({ queryKey: ["automaton", lang, approach], queryFn: () => api.automaton(lang, approach), staleTime: Infinity });
    }
  }, [near, queryClient]);

  const steps: Step[] = [
    {
      id: "dfa",
      label: "q0",
      title: "A DFA reads one symbol at a time",
      Stage: DfaStage,
      body: (
        <>
          <p>
            A <Term k="dfa">DFA</Term> keeps exactly one current state. For each symbol it follows the single arrow labelled with that symbol, so a
            string of length n takes exactly n steps and the machine never looks back.
          </p>
          <p>
            When the input runs out, the verdict is whether the current state is accepting (drawn with a double ring). For L7 each state remembers
            how much of <Code>abb</Code> the input has just spelled out, and that is all it ever needs to know.
          </p>
        </>
      ),
    },
    {
      id: "nfa",
      label: "q1",
      title: "An NFA follows every path at once",
      Stage: NfaStage,
      body: (
        <>
          <p>
            An <Term k="nfa">NFA</Term> may offer several arrows for a symbol, or none, and <Term k="epsilon">ε-moves</Term> it can take without
            reading anything. Instead of one state it tracks a set: every state some path could be in, plus whatever ε-moves reach from there, the{" "}
            <Term k="epsilon-closure">ε-closure</Term>.
          </p>
          <p>The string is accepted if any state in the final set accepts. NFAs are easy to build from a regular expression; running one means juggling sets.</p>
        </>
      ),
    },
    {
      id: "subset",
      label: "q2",
      title: "Subset construction turns sets into states",
      Stage: SubsetStage,
      body: (
        <>
          <p>
            The <Term k="subset-construction">subset construction</Term> removes the guessing: each set of NFA states the machine can be in becomes
            one DFA state. Start from the ε-closure of the start state, follow every symbol, and keep adding new sets until none appear.
          </p>
          <p>
            The result is deterministic and accepts the same language. For L9 every combination of the last three symbols needs its own state, so
            the {facts.l9 ? facts.l9.nfa : <InlineSkeleton className="w-[1em]" />}-state NFA becomes a DFA with{" "}
            {facts.l9 ? facts.l9.dfa : <InlineSkeleton className="w-[1em]" />} states. In the worst case the growth is exponential: n NFA states
            can need 2<sup>n</sup> DFA states.
          </p>
        </>
      ),
    },
    {
      id: "minimize",
      label: "q3",
      title: "Minimization merges what no string can tell apart",
      Stage: MinimizeStage,
      body: (
        <>
          <p>
            Many DFAs accept the same language. <Term k="moore">Moore&apos;s algorithm</Term> starts with two groups, accepting and non-accepting, and
            splits a group whenever its states disagree about which group a symbol leads to. When a round splits nothing, each group becomes one
            state.
          </p>
          <p>
            <Term k="hopcroft">Hopcroft&apos;s algorithm</Term> reaches the same partition faster by always splitting with the smaller half. For L8 the
            subset DFA&apos;s {facts.l8 ? facts.l8.before : <InlineSkeleton className="w-[1.4em]" />} states collapse to{" "}
            {facts.l8 ? facts.l8.after : <InlineSkeleton className="w-[1em]" />} after {facts.l8 ? facts.l8.rounds : <InlineSkeleton className="w-[1em]" />}{" "}
            rounds of splitting: the unique smallest DFA for the language.
          </p>
        </>
      ),
    },
    {
      id: "equivalence",
      label: "q4",
      title: "Equivalence: run two machines in lockstep",
      Stage: ProductStage,
      body: (
        <>
          <p>
            To check whether two DFAs accept the same language, run them together on pairs of states, the <Term k="product">product construction</Term>.
            A breadth-first search over the reachable pairs looks for one where exactly one of the two machines accepts. The path to the first such pair is the
            shortest string the two disagree on.
          </p>
          <p>
            Every learned automaton in this project was <Term k="equivalence">checked</Term> this way. RPNI&apos;s DFA for L7 looks almost right, yet
            the search finds {facts.cex === undefined ? <InlineSkeleton className="w-[1.6em]" /> : facts.cex === null ? "no difference" : <Code>{facts.cex || "ε"}</Code>}
            {facts.cex ? ", a string the true machine rejects: the data split had left it out of the training set." : "."}
          </p>
        </>
      ),
    },
    {
      id: "myhill-nerode",
      label: "q5",
      title: "A suffix that keeps two states apart",
      Stage: SuffixStage,
      body: (
        <>
          <p>
            Two strings must end in different states if some suffix sends one into the language and the other out of it.{" "}
            {facts.sep ? (
              <>
                In L7 the suffix <Code>{facts.sep.suffix}</Code> separates states <Code>{facts.sep.p}</Code> and <Code>{facts.sep.q}</Code>, so no correct
                machine may merge them.
              </>
            ) : (
              <InlineSkeleton className="w-40" />
            )}
          </p>
          <p>
            This is the <Term k="myhill-nerode">Myhill–Nerode</Term> theorem: the minimal DFA has exactly one state for each group of strings that no
            suffix can separate. A separating suffix for every pair of states proves that no smaller machine exists.
          </p>
        </>
      ),
    },
    {
      id: "limits",
      label: "q6",
      title: "The limit of a finite memory",
      Stage: PumpStage,
      body: (
        <>
          <p>
            A DFA with k states that reads k or more symbols must visit some state twice. The input between the two visits is a loop: repeat it or cut
            it out and the machine still ends in the same state, with the same verdict. This is the pumping lemma.
          </p>
          <p>
            It is also what makes some languages non-<Term k="regular">regular</Term>. Take a<sup>n</sup>b<sup>n</sup>, a run of a&apos;s followed by
            as many b&apos;s: pumping a loop inside the a&apos;s adds a&apos;s without adding b&apos;s, so no finite machine can count them. Every
            language in this project is regular, which is exactly why each one has a perfect DFA to hold the classifiers to.
          </p>
        </>
      ),
    },
  ];

  // The step that crosses the middle of the screen is the active one.
  useEffect(() => {
    if (!wide) return;
    const els = stepRefs.current.filter((e): e is HTMLLIElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.step);
            if (Number.isFinite(i)) setActive(i);
          }
        }
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  const current = steps[active] ?? steps[0];

  return (
    <section ref={sectionRef} id="theory" aria-labelledby="theory-title" className="relative py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl">
          <h2 id="theory-title" className="font-display text-[clamp(2.4rem,5.2vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-ink">
            Theory in motion
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
            Seven ideas from automata theory, each shown on a real machine from this project. The drawing follows along as you read.
          </p>
        </div>

        <div className="mt-14 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
          <ol className="relative">
            {/* the rail: the steps are states of one long run */}
            <span aria-hidden className="absolute bottom-0 left-[15px] top-0 w-px bg-[color:var(--line-strong)] [mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]" />
            {steps.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
                aria-current={wide && i === active ? "step" : undefined}
                className="relative pb-16 pl-12 lg:flex lg:min-h-[88vh] lg:flex-col lg:justify-center lg:pb-0"
              >
                <div className="relative">
                  <StateMarker label={s.label} state={!wide ? "idle" : i === active ? "active" : i < active ? "past" : "idle"} />
                  <h3
                    className={cn(
                      "font-display text-[clamp(1.6rem,2.4vw,2.15rem)] font-semibold leading-[1.08] transition-colors duration-300",
                      !wide || i === active ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {s.title}
                  </h3>
                  <div
                    className={cn(
                      "mt-4 max-w-[34rem] space-y-4 leading-relaxed transition-colors duration-300",
                      !wide || i === active ? "text-ink-2" : "text-muted",
                    )}
                  >
                    {s.body}
                  </div>
                </div>
                {!wide && <InlineStage Stage={s.Stage} title={s.title} />}
              </li>
            ))}
          </ol>

          {wide && (
            <div>
              <div className="sticky h-[calc(100vh-7.5rem)] max-h-[660px] py-2" style={{ top: "max(6rem, calc(50vh - 330px + 2rem))" }}>
                <StageFrame title={current.title} stepKey={current.id} Stage={current.Stage} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StateMarker({ label, state }: { label: string; state: "idle" | "active" | "past" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -left-12 top-0.5 grid h-8 w-8 place-items-center rounded-full border font-mono text-[11px] transition-all duration-300",
        state === "active" && "border-[color:var(--lamp)] bg-lamp text-[#1a1203] shadow-[0_0_18px_var(--lamp)]",
        state === "past" && "border-line-strong bg-panel-2 text-ink-2",
        state === "idle" && "border-line-strong bg-[color:var(--bg)] text-muted",
      )}
    >
      {label}
    </span>
  );
}

/** The sticky drawing: crossfades to the active step's live automaton. */
function StageFrame({ title, stepKey, Stage }: { title: string; stepKey: string; Stage: ComponentType<StageProps> }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLiveGate(ref);
  const reduce = useReducedMotion();
  return (
    <div ref={ref} role="group" aria-label={`Drawing for: ${title}`} className="relative h-full">
      <CropMarks />
      <div className="grid-paper relative h-full overflow-hidden rounded-lg border border-line bg-panel/50 p-6 backdrop-blur-[2px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepKey}
            className="h-full"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Stage live={live} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Small screens: the drawing sits under its text and only runs while on screen. */
function InlineStage({ Stage, title }: { Stage: ComponentType<StageProps>; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "300px 0px 300px 0px", once: true });
  const live = useLiveGate(ref);
  return (
    <div ref={ref} role="group" aria-label={`Drawing for: ${title}`} className="relative mt-8">
      <CropMarks size="h-3 w-3" />
      <div className="grid-paper flex min-h-[24rem] flex-col rounded-lg border border-line bg-panel/50 p-4">
        {near ? <Stage live={live} compact /> : null}
      </div>
    </div>
  );
}
