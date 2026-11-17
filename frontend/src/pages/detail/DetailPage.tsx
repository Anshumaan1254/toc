import { lazy, Suspense, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { errorMessage, useApproaches, useLanguages, useSummary } from "@/lib/api";
import { APPROACHES, APPROACH_BY_ID, FAMILIES, isApproachId, pct } from "@/lib/meta";
import type { Approach, Language } from "@/lib/types";
import { Badge, ErrorState, Skeleton, Stat } from "@/components/ui/primitives";
import { DimensionLine } from "@/components/ui/DimensionLine";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";
import NotFound from "@/pages/NotFound";

const AutomatonDetail = lazy(() => import("./AutomatonDetail"));
const NfaDetail = lazy(() => import("./NfaDetail"));
const MlDetail = lazy(() => import("./MlDetail"));

export interface DetailProps {
  language: Language;
  approach: Approach;
}

interface StatItem {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

/** The header's key figures. Honest zeros are spelled out; a large ML length drop gets a dimension line. */
function StatsRow({ approach, maxTrainLength }: { approach: Approach; maxTrainLength?: number }) {
  const s = approach.stats;
  const items: StatItem[] = [];
  if (approach.kind !== "ml") {
    if (s.states !== undefined) items.push({ label: "states", value: s.states, hint: s.states_before ? `${s.states_before} before minimization` : undefined });
    if (s.subset_dfa_states !== undefined) items.push({ label: <>after <Term k="subset-construction">subset construction</Term></>, value: s.subset_dfa_states });
    if (s.epsilon_moves !== undefined)
      items.push(
        s.epsilon_moves === 0
          ? { label: <Term k="epsilon">ε-moves</Term>, value: <span className="t-caption">no ε-moves in this one</span> }
          : { label: <Term k="epsilon">ε-moves</Term>, value: s.epsilon_moves },
      );
  } else {
    if (s.test_f1 !== undefined) items.push({ label: "test F1", value: pct(s.test_f1) });
    if (s.complexity !== undefined) items.push({ label: "model size", value: s.complexity.toLocaleString("en-US"), hint: "coefficients or tree nodes" });
  }
  const drop = s.test_accuracy !== undefined && s.long_accuracy !== undefined ? s.test_accuracy - s.long_accuracy : 0;
  const showDrop = approach.kind === "ml" && drop > 0.05;
  if (!showDrop) {
    if (s.test_accuracy !== undefined) items.push({ label: "test accuracy", value: pct(s.test_accuracy) });
    if (s.long_accuracy !== undefined) items.push({ label: <>accuracy on lengths 21–40</>, value: pct(s.long_accuracy) });
  }
  if (s.fidelity_test !== undefined && s.fidelity_test !== null) items.push({ label: <Term k="fidelity">fidelity to its model</Term>, value: pct(s.fidelity_test) });

  return (
    <div className="space-y-4">
      {showDrop && (
        <div className="max-w-sm">
          <div className="grid grid-cols-2 gap-6 [&_.t-stat]:text-[clamp(1.6rem,2.1vw,2rem)]">
            <Stat label="test accuracy" value={pct(s.test_accuracy)} />
            <Stat label="accuracy on lengths 21–40" value={pct(s.long_accuracy)} />
          </div>
          <DimensionLine className="mt-2" label={`${Math.round(drop * 100)} points lost past length ${maxTrainLength ?? 20}`} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 [&_.t-stat]:text-[clamp(1.6rem,2.1vw,2rem)]">
        {items.slice(0, showDrop ? 3 : 4).map((it, i) => (
          <Stat key={i} label={it.label} value={it.value} hint={it.hint} className={cn(i >= 2 && "hidden sm:block")} />
        ))}
      </div>
    </div>
  );
}

/** A breadcrumb crumb that is also a native select (keeps select semantics and keyboard behaviour). */
function CrumbSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative inline-flex max-w-full items-center">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[16rem] cursor-pointer appearance-none truncate rounded-sm border-0 bg-transparent py-0.5 pl-0 pr-5 text-sm text-ink-2 [field-sizing:content] hover:text-ink sm:max-w-none"
      >
        {children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-0 text-muted" aria-hidden />
    </span>
  );
}

function HeaderSkeleton() {
  return (
    <div className="pb-24" aria-busy="true" aria-label="Loading">
      <div className="relative pb-6 pt-24">
        <div className="grid-paper grid-paper-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl space-y-4 px-6">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-[28rem] max-w-full" />
          <Skeleton className="h-5 w-[36rem] max-w-full" />
          <Skeleton className="h-6 w-60" />
        </div>
      </div>
      <div className="mx-auto mt-6 flex max-w-6xl items-center justify-center px-6">
        <div className="grid h-72 w-full place-items-center rounded-2xl border border-dashed border-line-strong">
          <div className="h-16 w-16 rounded-full border-2 border-dashed border-line-strong" aria-hidden />
          <p className="t-annotation -mt-24">Drawing the machine…</p>
        </div>
      </div>
    </div>
  );
}

export default function DetailPage() {
  const { lang, approach: approachId } = useParams();
  const navigate = useNavigate();
  const languages = useLanguages();
  const knownLanguage = !!languages.data?.some((l) => l.id === lang);
  const approaches = useApproaches(knownLanguage ? lang : undefined);
  const summary = useSummary();

  if (languages.data && !knownLanguage) return <NotFound />;
  if (!isApproachId(approachId)) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-32">
        <ErrorState message={`"${approachId}" is not an approach. Pick one from the explorer.`} />
        <Link to="/explore" className="mt-6 inline-block text-ink underline">
          Back to the explorer
        </Link>
      </div>
    );
  }
  if (languages.isLoading || (knownLanguage && approaches.isLoading)) return <HeaderSkeleton />;
  if (languages.error || approaches.error) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-32">
        <ErrorState
          message={errorMessage(languages.error ?? approaches.error)}
          onRetry={() => {
            void languages.refetch();
            void approaches.refetch();
          }}
        />
      </div>
    );
  }
  const language = languages.data?.find((l) => l.id === lang);
  const approach = approaches.data?.find((a) => a.id === approachId);
  if (!language || !approach) return <HeaderSkeleton />;

  const meta = APPROACH_BY_ID[approach.id];
  const sheet = APPROACHES.findIndex((a) => a.id === approach.id) + 1;
  const maxStates = (summary.data?.meta.extraction_config as { max_states?: number } | undefined)?.max_states;
  const maxTrainLength = summary.data?.meta.max_train_length;

  return (
    <div className="pb-24">
      <header className="relative pb-6 pt-24">
        <div className="grid-paper grid-paper-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-6">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
            <Link to="/explore" className="hover:text-ink">
              Explore
            </Link>
            <ChevronRight size={14} aria-hidden />
            <CrumbSelect id="switch-language" label="Language" value={language.id} onChange={(v) => navigate(`/explore/${v}/${approach.id}`)}>
              {languages.data!.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} · {l.name}
                </option>
              ))}
            </CrumbSelect>
            <ChevronRight size={14} aria-hidden />
            <CrumbSelect id="switch-approach" label="Approach" value={approach.id} onChange={(v) => navigate(`/explore/${language.id}/${v}`)}>
              {(["truth", "learned", "ml"] as const).map((fam) => (
                <optgroup key={fam} label={FAMILIES[fam].name}>
                  {APPROACHES.filter((a) => a.family === fam).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </CrumbSelect>
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
            <div className="min-w-0 space-y-3">
              <h1 className="font-display text-[clamp(2.1rem,4vw,3.5rem)] font-semibold leading-none tracking-[-0.015em] text-ink">{approach.name}</h1>
              <p className="hidden max-w-[70ch] text-ink-2 sm:block">{approach.blurb}</p>
              <p className="t-caption hidden max-w-[80ch] sm:block">
                <span className="text-ink-2">{language.id}</span> — {language.description} Regex{" "}
                <code className="break-all rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">{language.regex}</code>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {approach.stats.equivalent_to_truth === true && <Badge tone="accept">matches the ground truth</Badge>}
                {approach.stats.equivalent_to_truth === false && <Badge tone="reject">differs from the ground truth</Badge>}
                {approach.stats.converged === true && approach.id.startsWith("lstar") && <Badge tone="outline">L* converged</Badge>}
                {approach.stats.converged === false && <Badge tone="lamp">stopped at the {maxStates ? `${maxStates}-state ` : ""}budget</Badge>}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              {/* Drafting title block */}
              <dl className="t-annotation hidden max-w-full grid-cols-[auto_1fr] border border-line-strong text-left lg:grid [&>*]:border-b [&>*]:border-line [&>*]:px-3 [&>*]:py-1">
                <dt className="border-r border-line">language</dt>
                <dd className="truncate text-ink">
                  {language.id} · {"{"}
                  {language.alphabet.join(",")}
                  {"}"}
                </dd>
                <dt className="border-r border-line">family</dt>
                <dd className="text-ink">{FAMILIES[approach.family].name}</dd>
                <dt className="!border-b-0 border-r border-line">sheet</dt>
                <dd className="!border-b-0 text-ink">
                  {sheet} of {APPROACHES.length}
                </dd>
              </dl>
              <StatsRow approach={approach} maxTrainLength={maxTrainLength} />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pt-6">
        <Suspense
          fallback={
            <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-line-strong">
              <p className="t-annotation">Drawing the machine…</p>
            </div>
          }
        >
          {!approach.available ? (
            <ErrorState message="This approach has no results yet. Run notebook 02 to train the models and learn the automata." />
          ) : meta.kind === "ml" ? (
            <MlDetail key={`${language.id}-${approach.id}`} language={language} approach={approach} />
          ) : meta.kind === "nfa" ? (
            <NfaDetail key={`${language.id}-${approach.id}`} language={language} approach={approach} />
          ) : (
            <AutomatonDetail key={`${language.id}-${approach.id}`} language={language} approach={approach} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
