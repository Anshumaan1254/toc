import { lazy, Suspense } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import { errorMessage, useApproaches, useLanguages, useSummary } from "@/lib/api";
import { APPROACHES, APPROACH_BY_ID, FAMILIES, isApproachId, pct } from "@/lib/meta";
import type { Approach, Language } from "@/lib/types";
import { Badge, ErrorState, LoadingBlock, Stat } from "@/components/ui/primitives";
import { Term } from "@/components/ui/Term";
import NotFound from "@/pages/NotFound";

const AutomatonDetail = lazy(() => import("./AutomatonDetail"));
const NfaDetail = lazy(() => import("./NfaDetail"));
const MlDetail = lazy(() => import("./MlDetail"));

export interface DetailProps {
  language: Language;
  approach: Approach;
}

function StatsRow({ approach }: { approach: Approach }) {
  const s = approach.stats;
  const items: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }[] = [];
  if (approach.kind !== "ml") {
    if (s.states !== undefined) items.push({ label: "states", value: s.states, hint: s.states_before ? `${s.states_before} before minimization` : undefined });
    if (s.subset_dfa_states !== undefined) items.push({ label: <>states after <Term k="subset-construction">subset construction</Term></>, value: s.subset_dfa_states });
    if (s.epsilon_moves !== undefined) items.push({ label: <Term k="epsilon">ε-moves</Term>, value: s.epsilon_moves });
  } else {
    if (s.test_f1 !== undefined) items.push({ label: "test F1", value: pct(s.test_f1) });
    if (s.complexity !== undefined) items.push({ label: "model size", value: s.complexity.toLocaleString("en-US"), hint: "coefficients or tree nodes" });
  }
  if (s.test_accuracy !== undefined) items.push({ label: "test accuracy", value: pct(s.test_accuracy) });
  if (s.long_accuracy !== undefined) items.push({ label: <>accuracy on lengths 21–40</>, value: pct(s.long_accuracy) });
  if (s.fidelity_test !== undefined && s.fidelity_test !== null) items.push({ label: <Term k="fidelity">fidelity to its model</Term>, value: pct(s.fidelity_test) });
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {items.slice(0, 5).map((it, i) => (
        <Stat key={i} label={it.label} value={it.value} hint={it.hint} />
      ))}
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
        <Link to="/explore" className="mt-6 inline-block text-lamp underline">
          Back to the explorer
        </Link>
      </div>
    );
  }
  if (languages.isLoading || (knownLanguage && approaches.isLoading)) return <LoadingBlock className="mx-auto max-w-6xl px-6 pt-32" />;
  if (languages.error || approaches.error) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-32">
        <ErrorState message={errorMessage(languages.error ?? approaches.error)} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  const language = languages.data?.find((l) => l.id === lang);
  const approach = approaches.data?.find((a) => a.id === approachId);
  if (!language || !approach) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-32">
        <ErrorState message={`Unknown language "${lang}". Choose one of L1–L10.`} />
      </div>
    );
  }
  const meta = APPROACH_BY_ID[approach.id];

  const sheet = APPROACHES.findIndex((a) => a.id === approach.id) + 1;
  const maxStates = (summary.data?.meta.extraction_config as { max_states?: number } | undefined)?.max_states;
  const selectClass =
    "h-8 rounded-full border border-line bg-panel/80 pl-3 pr-8 text-sm text-ink hover:border-line-strong focus-visible:outline-2";

  return (
    <div className="pb-24">
      <header className="relative pb-14 pt-28">
        <div className="grid-paper grid-paper-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <Link to="/explore" className="hover:text-ink">
                Explore
              </Link>
              <ChevronRight size={14} aria-hidden />
              <Link to={`/explore?lang=${language.id}`} className="hover:text-ink">
                {language.id} · {language.name}
              </Link>
              <ChevronRight size={14} aria-hidden />
              <span className="text-ink-2" aria-current="page">
                {approach.name}
              </span>
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="switch-language">
                Language
              </label>
              <select id="switch-language" value={language.id} onChange={(e) => navigate(`/explore/${e.target.value}/${approach.id}`)} className={selectClass}>
                {languages.data!.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {l.name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="switch-approach">
                Approach
              </label>
              <select id="switch-approach" value={approach.id} onChange={(e) => navigate(`/explore/${language.id}/${e.target.value}`)} className={selectClass}>
                {(["truth", "learned", "ml"] as const).map((fam) => (
                  <optgroup key={fam} label={FAMILIES[fam].name}>
                    {APPROACHES.filter((a) => a.family === fam).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl space-y-4">
              <h1 className="t-page text-ink">{approach.name}</h1>
              <p className="t-lede">{approach.blurb}</p>
              <p className="max-w-[68ch] text-ink-2">
                <span className="font-medium text-ink">{language.id}</span> — {language.description}{" "}
                <span className="whitespace-nowrap">
                  Regex <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-sm text-ink">{language.regex}</code>
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {approach.stats.equivalent_to_truth === true && <Badge tone="accept">matches the ground truth</Badge>}
                {approach.stats.equivalent_to_truth === false && <Badge tone="reject">differs from the ground truth</Badge>}
                {approach.stats.converged === true && approach.id.startsWith("lstar") && <Badge tone="outline">L* converged</Badge>}
                {approach.stats.converged === false && (
                  <Badge tone="lamp">stopped at the {maxStates ? `${maxStates}-state ` : ""}budget</Badge>
                )}
              </div>
            </div>

            {/* Drafting title block */}
            <dl className="t-annotation grid min-w-64 grid-cols-[auto_1fr] border border-line-strong text-left [&>*]:border-b [&>*]:border-line [&>*]:px-3 [&>*]:py-1.5">
              <dt className="border-r border-line">language</dt>
              <dd className="text-ink">
                {language.id} · {"{"}
                {language.alphabet.join(",")}
                {"}"}
              </dd>
              <dt className="border-r border-line">drawing</dt>
              <dd className="text-ink">{approach.name}</dd>
              <dt className="border-r border-line">family</dt>
              <dd className="text-ink">{FAMILIES[approach.family].name}</dd>
              <dt className="border-r border-line !border-b-0">sheet</dt>
              <dd className="!border-b-0 text-ink">
                {sheet} of {APPROACHES.length}
              </dd>
            </dl>
          </div>

          <div className="mt-12">
            <StatsRow approach={approach} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pt-12">
        <Suspense fallback={<LoadingBlock />}>
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
