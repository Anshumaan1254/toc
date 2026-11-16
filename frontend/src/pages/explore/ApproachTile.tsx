import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { api, useAutomaton } from "@/lib/api";
import { APPROACH_BY_ID, duration, int, pct } from "@/lib/meta";
import type { Approach, ApproachId, AutomatonPayload, Language } from "@/lib/types";
import { AutomatonGraph } from "@/components/graph/AutomatonGraph";
import { layoutGraph, toGraphModel } from "@/components/graph/layout";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { SpotlightTile } from "./SpotlightTile";
import { AccuracyMeter, SizeBar, StateStrip } from "./Meter";
import { CODE, DIAGRAM_TILES, SIZE_UNIT, WIDE_TILES, approachName } from "./explore-utils";

type Tone = "accept" | "reject" | "lamp" | "outline";

function badgeFor(a: Approach, language: Language): { tone: Tone; text: string; title: string } | null {
  if (a.family === "truth") {
    if (a.id === "dfa") return { tone: "outline", text: "Defines the language", title: "Hand-built. Every other approach is scored against this DFA." };
    if (a.id === "nfa") return { tone: "outline", text: "Exact", title: "Accepts exactly the same strings as the ground-truth DFA." };
    return { tone: "outline", text: "Exact by construction", title: "Subset construction and Hopcroft's algorithm both preserve the language exactly." };
  }
  if (a.family === "learned") {
    if (a.stats.equivalent_to_truth === true)
      return { tone: "accept", text: "Equivalent", title: "Accepts exactly the same strings as the ground-truth DFA (checked on the product automaton)." };
    if (a.stats.equivalent_to_truth === false)
      return { tone: "reject", text: "Not equivalent", title: "Disagrees with the ground-truth DFA on at least one string, even if the test sets never show it." };
    return null;
  }
  if (a.pipeline && language.best_pipeline?.pipeline === a.pipeline)
    return { tone: "lamp", text: `Best pipeline on ${language.id}`, title: "Ranked first among the ML pipelines on test F1, then test accuracy, then the smallest model." };
  return null;
}

function KindGlyph({ kind, color }: { kind: "dfa" | "nfa" | "ml"; color: string }) {
  if (kind === "ml") {
    return (
      <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="shrink-0">
        <path d="M1 10.5 C 6 10.5, 6 1.5, 15 1.5" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle cx="7" cy="7" r="5.6" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={kind === "nfa" ? "2.2 1.8" : undefined} />
      <circle cx="7" cy="7" r="2.6" fill={color} />
    </svg>
  );
}

const TILE_RADIUS = 18;
/** Below this scale a thumbnail is just texture: draw it legibly instead and crop it on the right. */
const TILE_MIN_SCALE = 0.42;
const TILE_DRAW_HEIGHT = 132;
const CROP_FADE = "linear-gradient(to right, #000 calc(100% - 64px), transparent)";

/** A small drawing of the automaton itself, drawn in when the tile scrolls into view. */
function TileDiagram({ automaton, failed }: { automaton: AutomatonPayload | undefined; failed: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => (automaton ? layoutGraph(toGraphModel(automaton), { rankdir: "LR", r: TILE_RADIUS }) : null), [automaton]);
  const crop = !!layout && width > 0 && Math.min(width / layout.width, TILE_DRAW_HEIGHT / layout.height) < TILE_MIN_SCALE;
  const shown = crop && layout ? layout.nodes.filter((nd) => nd.x * TILE_MIN_SCALE <= width - 24).length : 0;

  return (
    <div ref={boxRef} aria-hidden className="grid-paper relative grid h-[148px] place-items-center overflow-hidden rounded-xl border border-line px-2">
      {automaton && layout ? (
        crop ? (
          <div className="w-full overflow-hidden" style={{ maskImage: CROP_FADE, WebkitMaskImage: CROP_FADE }}>
            <div style={{ width: Math.round(layout.width * TILE_MIN_SCALE) }}>
              <AutomatonGraph automaton={automaton} zoomable={false} maxHeight={Math.ceil(layout.height * TILE_MIN_SCALE) + 2} radius={TILE_RADIUS} ariaLabel="" />
            </div>
          </div>
        ) : (
          <div className="w-full">
            <AutomatonGraph automaton={automaton} zoomable={false} maxHeight={TILE_DRAW_HEIGHT} radius={TILE_RADIUS} ariaLabel="" />
          </div>
        )
      ) : failed ? (
        <span className="text-xs text-muted">Diagram unavailable</span>
      ) : (
        <Skeleton className="absolute inset-3" />
      )}
      {crop && layout && (
        <span className="absolute bottom-1.5 right-2 rounded-md bg-panel/90 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
          {shown} of {layout.nodes.length} states shown
        </span>
      )}
    </div>
  );
}

export interface ApproachTileProps {
  approach: Approach;
  /** The language these numbers were measured on (lags behind the selection while new numbers load). */
  language: Language;
  /** The selected language: where the tile links to. */
  linkLanguageId: string;
  /** Lengths of the held-out long strings, e.g. "21–40" (from the dataset report); null while unknown. */
  longRange: string | null;
  /** The L* tile for an ML pipeline, used for the extraction fact line. */
  partner?: Approach;
  /** Highlighted because its partner tile (same pipeline, other family) is hovered. */
  paired: boolean;
  onHoverChange: (id: ApproachId | null) => void;
}

export function ApproachTile({ approach, language, linkLanguageId, longRange, partner, paired, onHoverChange }: ApproachTileProps) {
  const meta = APPROACH_BY_ID[approach.id];
  const kind = meta?.kind ?? approach.kind;
  const color = meta?.color ?? "var(--series-truth)";
  const s = approach.stats;
  const name = approachName(approach);
  const wide = WIDE_TILES.has(approach.id);
  const diagram = DIAGRAM_TILES.has(approach.id) && approach.available && kind !== "ml";
  const blurbId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const inView = useInView(bodyRef, { once: true, amount: 0.3 });
  // The drawing (and the NFA's provenance) is fetched once the tile is on screen.
  const automatonQuery = useAutomaton(diagram && inView ? language.id : undefined, approach.id);
  const automaton = automatonQuery.data?.automaton;
  const construction = automaton?.kind === "nfa" ? automaton.meta?.["construction"] : undefined;
  const queryClient = useQueryClient();
  const badge = badgeFor(approach, language);
  const minimal = language.expected_min_states;
  const longLabel = longRange ? `Lengths ${longRange}` : "Longer strings";
  const dfaTransitions = minimal * language.alphabet.length;

  const prefetch = () => {
    if (!approach.available) return;
    if (kind === "ml" && approach.pipeline) {
      const pipeline = approach.pipeline;
      void queryClient.prefetchQuery({ queryKey: ["model", language.id, pipeline], queryFn: () => api.model(language.id, pipeline), staleTime: Infinity });
    } else {
      void queryClient.prefetchQuery({
        queryKey: ["automaton", language.id, approach.id],
        queryFn: () => api.automaton(language.id, approach.id),
        staleTime: Infinity,
      });
    }
  };

  // ------------------------------------------------------------ the footer facts
  const facts: { text: string; tone?: "lamp" }[] = [];
  if (approach.id === "nfa") {
    const eps = s.epsilon_moves === undefined ? "" : s.epsilon_moves === 0 ? "no ε-moves" : `${s.epsilon_moves} ε-move${s.epsilon_moves === 1 ? "" : "s"}`;
    const how = construction === "thompson" ? "Thompson's construction from the regex" : construction === "hand-built" ? "Drawn by hand" : "";
    const line = [how, eps].filter(Boolean).join(", ");
    if (line) facts.push({ text: line.charAt(0).toUpperCase() + line.slice(1) });
    if (s.subset_dfa_states !== undefined) facts.push({ text: `${s.subset_dfa_states} DFA states after subset construction` });
  } else if (approach.id === "min_dfa") {
    if (s.states_before !== undefined)
      facts.push({ text: s.states_before === s.states ? "Subset construction was already minimal" : `Merged down from ${s.states_before} states` });
  } else if (approach.id === "dfa") {
    if (s.states !== undefined) facts.push({ text: s.states === minimal ? "Already minimal" : `The minimal DFA has ${minimal}` });
  } else if (approach.id.startsWith("lstar_")) {
    if (s.fidelity_test !== undefined && s.fidelity_test !== null) facts.push({ text: `Agrees with its model on ${pct(s.fidelity_test)} of test strings` });
    if (s.converged === false)
      facts.push({
        text: s.stop_reason === "max_states" ? "Stopped at its state budget" : `Stopped before converging${s.stop_reason ? ` (${s.stop_reason.replace(/_/g, " ")})` : ""}`,
        tone: "lamp",
      });
  } else if (approach.family === "learned") {
    if (s.learning_time_s !== undefined && s.learning_time_s !== null) facts.push({ text: `Learned in ${duration(s.learning_time_s)}` });
  } else if (kind === "ml") {
    if (s.test_f1 !== undefined) facts.push({ text: `Test F1 ${pct(s.test_f1)}` });
    if (partner?.stats.states !== undefined) {
      const eq = partner.stats.equivalent_to_truth;
      facts.push({ text: `Its L* DFA: ${partner.stats.states} states${eq === true ? ", equivalent" : eq === false ? ", not equivalent" : ""}` });
    }
  }

  const statesText = s.states !== undefined ? `, ${s.states} states` : "";
  const sizeText = kind === "ml" && s.complexity !== undefined && approach.pipeline ? `, ${int(s.complexity)} ${SIZE_UNIT[approach.pipeline]}` : "";
  const badgeWords = badge ? badge.text.charAt(0).toLowerCase() + badge.text.slice(1) : "";
  const label = `${name}${badge ? `, ${badgeWords}` : ""}: ${pct(s.test_accuracy)} on test strings, ${pct(s.long_accuracy)} on ${longRange ? `lengths ${longRange.replace("–", " to ")}` : "longer strings"}${statesText}${sizeText}.`;
  const pairCaption = approach.id.startsWith("ml_") ? `Source of ${partner ? CODE[partner.id] : "its L* DFA"}` : `Extracted from ${CODE[approach.id].slice(3, -1)}`;

  const identity = (
    <div className="flex min-w-0 flex-col">
      <div className="flex h-6 items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs font-medium text-ink-2">
          <KindGlyph kind={kind} color={color} />
          {CODE[approach.id] ?? approach.id}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {paired ? (
            <motion.span
              key="pair"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="truncate text-xs font-medium text-lamp"
            >
              {pairCaption}
            </motion.span>
          ) : badge ? (
            <motion.span
              key="badge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              title={badge.title}
              className="min-w-0"
            >
              <Badge tone={badge.tone} className="whitespace-nowrap">
                {badge.text}
              </Badge>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <h4 className="mt-3 font-display text-[19px] font-semibold leading-snug text-ink">{name}</h4>
      <p id={blurbId} className="mt-1.5 text-sm leading-relaxed text-ink-2">
        {approach.blurb}
      </p>
      {!approach.available && <p className="mt-2 text-sm text-reject">Not available yet: run notebook 02 to train it.</p>}
    </div>
  );

  const meters = (
    <>
      <AccuracyMeter label="Test strings" value={s.test_accuracy} color={color} />
      <AccuracyMeter label={longLabel} value={s.long_accuracy} color={color} chance />
    </>
  );

  const footer = (
    <div className="space-y-1.5 border-t border-line pt-3">
      {kind === "ml" ? (
        s.complexity !== undefined && approach.pipeline ? (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted">Model size</span>
              <span className="font-mono text-[13px] font-medium text-ink">{int(s.complexity)}</span>
            </div>
            <SizeBar size={s.complexity} reference={dfaTransitions} color={color} />
            <p className="mt-1.5 text-xs text-muted">{SIZE_UNIT[approach.pipeline]}, log scale</p>
          </div>
        ) : null
      ) : s.states !== undefined ? (
        <div className="flex items-center justify-between gap-2">
          <StateStrip states={s.states} minimal={Math.min(minimal, s.states)} color={color} max={wide ? 16 : 11} className="min-w-0" />
          <span className="shrink-0 whitespace-nowrap font-mono text-[13px] font-medium text-ink">
            {s.states} <span className="font-normal text-muted">state{s.states === 1 ? "" : "s"}</span>
          </span>
        </div>
      ) : null}
      {facts.map((f) => (
        <p key={f.text} className={cn("text-xs leading-snug", f.tone === "lamp" ? "text-lamp" : "text-muted")}>
          {f.text}
        </p>
      ))}
    </div>
  );

  return (
    <SpotlightTile
      to={approach.available ? `/explore/${linkLanguageId}/${approach.id}` : undefined}
      spotlightColor={color}
      aria-label={approach.available ? label : undefined}
      aria-describedby={blurbId}
      onPointerEnter={() => {
        prefetch();
        onHoverChange(approach.id);
      }}
      onPointerLeave={() => onHoverChange(null)}
      onFocus={() => {
        prefetch();
        onHoverChange(approach.id);
      }}
      onBlur={() => onHoverChange(null)}
      className={cn(wide ? "row-span-4" : "row-span-4 grid grid-rows-subgrid gap-y-0", !approach.available && "opacity-60")}
    >
      {/* the pairing ring, lit when the partner tile is hovered or focused */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[2] rounded-[inherit] border-2 border-dashed border-[color:var(--lamp)] transition-opacity duration-300",
          paired ? "opacity-80" : "opacity-0",
        )}
      />
      {wide ? (
        <div ref={bodyRef} className="row-span-4 flex h-full flex-col p-5">
          <div className="grid grid-cols-1 gap-x-7 sm:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
            {identity}
            <div className="space-y-3 pt-5 sm:self-end sm:pt-0">
              {meters}
              {footer}
            </div>
          </div>
          {diagram && (
            <div className="mt-auto pt-5">
              <TileDiagram automaton={automaton} failed={automatonQuery.isError} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* four rows shared with the neighbouring tiles (subgrid), so meters line up across a row */}
          <div ref={bodyRef} className="min-w-0 px-5 pt-5">
            {identity}
          </div>
          <div className="min-w-0 px-5">
            {diagram && (
              <div className="pt-4">
                <TileDiagram automaton={automaton} failed={automatonQuery.isError} />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-3 px-5 pt-5">{meters}</div>
          <div className="min-w-0 px-5 pb-5 pt-3">{footer}</div>
        </>
      )}
    </SpotlightTile>
  );
}
