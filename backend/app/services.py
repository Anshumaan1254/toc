"""Business logic behind the API: catalogue, classification traces, comparison, live learning."""

from __future__ import annotations

import time
import uuid
import warnings
from collections import OrderedDict
from typing import Any

import numpy as np
from fastapi import HTTPException
from sklearn.exceptions import ConvergenceWarning

from src.automata.dfa import DFA
from src.automata.languages import LANGUAGES, Language
from src.automata.learners import MembershipOracle, SamplingEquivalenceOracle, edsm, lstar, rpni
from src.automata.minimize import distinguishing_suffixes, hopcroft_minimize
from src.ml.explain import explain_string
from src.ml.pipelines import PIPELINE_NAMES, make_pipeline

from .store import ALL_APPROACHES, DFA_APPROACHES, ArtifactStore, MissingArtifact

MAX_TRAIN_LENGTH = 20  # longest string in the training split (notebook 02 asserts it)

APPROACH_INFO: dict[str, dict[str, str]] = {
    "dfa": {"name": "Ground-truth DFA", "family": "truth", "kind": "dfa", "blurb": "The hand-built automaton that defines the language: one state per thing worth remembering."},
    "nfa": {"name": "NFA", "family": "truth", "kind": "nfa", "blurb": "A nondeterministic machine that may be in several states at once; ε-moves cost no input."},
    "min_dfa": {"name": "Minimized DFA", "family": "truth", "kind": "dfa", "blurb": "Subset construction of the NFA, then Hopcroft's algorithm merges every pair of equivalent states."},
    "lstar_lr": {"name": "L* DFA · Logistic Regression", "family": "learned", "kind": "dfa", "pipeline": "lr", "blurb": "The finite-state machine the logistic regression implicitly computes, extracted by Angluin's L*."},
    "lstar_dt": {"name": "L* DFA · Decision Tree", "family": "learned", "kind": "dfa", "pipeline": "dt", "blurb": "The decision tree, queried by L* as a membership oracle and turned into a DFA."},
    "lstar_rf": {"name": "L* DFA · Random Forest", "family": "learned", "kind": "dfa", "pipeline": "rf", "blurb": "The random forest's behaviour distilled into a DFA by L*."},
    "lstar_stack": {"name": "L* DFA · Stacked ensemble", "family": "learned", "kind": "dfa", "pipeline": "stack", "blurb": "The stacked ensemble's behaviour distilled into a DFA by L*."},
    "rpni": {"name": "Passive DFA · RPNI", "family": "learned", "kind": "dfa", "blurb": "Learned from the labelled training strings alone by merging states of a prefix tree."},
    "edsm": {"name": "Passive DFA · EDSM", "family": "learned", "kind": "dfa", "blurb": "Evidence-driven state merging: always performs the best-supported merge first."},
    "ml_lr": {"name": "Logistic Regression", "family": "ml", "kind": "ml", "pipeline": "lr", "blurb": "A weighted vote over 124 generic string features, squashed into a probability."},
    "ml_dt": {"name": "Decision Tree", "family": "ml", "kind": "ml", "pipeline": "dt", "blurb": "A sequence of yes/no questions about the string's features."},
    "ml_rf": {"name": "Random Forest", "family": "ml", "kind": "ml", "pipeline": "rf", "blurb": "Hundreds of randomized decision trees voting together."},
    "ml_stack": {"name": "Stacked ensemble", "family": "ml", "kind": "ml", "pipeline": "stack", "blurb": "Logistic regression on top of the LR, tree and forest probabilities."},
}


def bad_request(message: str, status: int = 422, **extra: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"message": message, **extra})


def require_language(lid: str) -> Language:
    if lid not in LANGUAGES:
        raise bad_request(f"Unknown language '{lid}'. Choose one of {', '.join(LANGUAGES)}.", status=404)
    return LANGUAGES[lid]


def require_approach(approach: str) -> dict[str, str]:
    if approach not in APPROACH_INFO:
        raise bad_request(f"Unknown approach '{approach}'. Choose one of {', '.join(ALL_APPROACHES)}.", status=404)
    return APPROACH_INFO[approach]


def validate_string(s: str, alphabet: tuple[str, ...]) -> str:
    bad = sorted({ch for ch in s if ch not in alphabet})
    if bad:
        shown = ", ".join(repr(ch) for ch in bad)
        raise bad_request(
            f"The symbol{'s' if len(bad) > 1 else ''} {shown} {'are' if len(bad) > 1 else 'is'} not in the alphabet {{{', '.join(alphabet)}}}.",
            invalid_symbols=bad,
            alphabet=list(alphabet),
        )
    return s


# =============================================================================
# Catalogue
# =============================================================================
def language_list(store: ArtifactStore) -> list[dict[str, Any]]:
    out = []
    for lid, lang in LANGUAGES.items():
        item = lang.summary()
        if store.metrics:
            best = store.metrics["summary"]["best_pipeline_per_language"].get(lid)
            item["best_pipeline"] = best
        out.append(item)
    return out


def approach_stats(store: ArtifactStore, lid: str, approach: str) -> dict[str, Any]:
    lang = LANGUAGES[lid]
    info = APPROACH_INFO[approach]
    stats: dict[str, Any] = {}
    if approach == "dfa":
        stats = {"states": lang.dfa.num_states, "test_accuracy": 1.0, "long_accuracy": 1.0}
    elif approach in ("nfa", "min_dfa"):
        record = store.automaton_record(lid, approach)
        stats = dict(record.get("stats", {}))
        stats.update({"test_accuracy": 1.0, "long_accuracy": 1.0})
    elif info["family"] == "learned":
        m = store.automaton_metrics(lid, approach)
        if m:
            stats = {
                "states": m["states"],
                "test_accuracy": m["test"]["accuracy"],
                "long_accuracy": m["long"]["accuracy"],
                "fidelity_test": m["test"].get("fidelity"),
                "equivalent_to_truth": m["equivalent_to_truth"],
                "converged": m.get("converged"),
                "stop_reason": m.get("stop_reason"),
                "membership_queries": m.get("membership_queries"),
                "learning_time_s": m.get("learning_time_s"),
            }
    else:
        m = store.ml_metrics(lid, info["pipeline"])
        if m:
            stats = {
                "test_accuracy": m["test"]["accuracy"],
                "test_f1": m["test"]["f1"],
                "long_accuracy": m["long"]["accuracy"],
                "complexity": m["complexity"]["size"],
                "train_time_s": m["train_time_s"],
            }
    return stats


def approach_list(store: ArtifactStore, lid: str) -> list[dict[str, Any]]:
    require_language(lid)
    items = []
    for approach, info in APPROACH_INFO.items():
        try:
            stats = approach_stats(store, lid, approach)
            available = True
        except MissingArtifact:
            stats, available = {}, False
        if info["family"] != "truth" and not stats:
            available = available and store.has_results
        items.append({"id": approach, **info, "stats": stats, "available": available})
    return items


def pipeline_detail(store: ArtifactStore, lid: str, pid: str) -> dict[str, Any]:
    require_language(lid)
    if pid not in PIPELINE_NAMES:
        raise bad_request(f"Unknown pipeline '{pid}'.", status=404)
    metrics = store.ml_metrics(lid, pid)
    if metrics is None:
        raise MissingArtifact("Metrics not found. Run notebook 02.")
    extracted = store.automaton_metrics(lid, f"lstar_{pid}")
    return {
        "language": lid,
        "pipeline": pid,
        "name": PIPELINE_NAMES[pid],
        "metrics": {k: metrics[k] for k in ("val", "test", "long")},
        "best_params": metrics["best_params"],
        "tuning": metrics["tuning"],
        "train_time_s": metrics["train_time_s"],
        "inference_time_per_string_s": metrics["inference_time_per_string_s"],
        "single_string_latency_s": metrics.get("single_string_latency_s"),
        "generalization_drop": metrics["generalization_drop"],
        "complexity": metrics["complexity"],
        "explanation": store.explanations.get((lid, pid)),
        "extracted_dfa": {"approach": f"lstar_{pid}", **(extracted or {})},
    }


# =============================================================================
# Classification
# =============================================================================
def _dfa_trace(dfa: DFA, s: str) -> dict[str, Any]:
    steps = dfa.trace(s)
    final = steps[-1]["to"] if steps else dfa.names[dfa.start]
    return {"start": dfa.names[dfa.start], "steps": steps, "final": final}


def classify(store: ArtifactStore, lid: str, approach: str, s: str) -> dict[str, Any]:
    lang = require_language(lid)
    info = require_approach(approach)
    validate_string(s, lang.alphabet)
    truth = lang.dfa.accepts(s)
    result: dict[str, Any] = {"language": lid, "approach": approach, "name": info["name"], "family": info["family"], "kind": info["kind"], "string": s, "length": len(s)}
    try:
        if approach in DFA_APPROACHES:
            dfa = store.dfa(lid, approach)
            started = time.perf_counter()
            accepted = dfa.accepts(s)
            elapsed = time.perf_counter() - started
            result.update({"accepted": accepted, "trace": _dfa_trace(dfa, s)})
        elif approach == "nfa":
            nfa = store.nfa(lid)
            started = time.perf_counter()
            accepted = nfa.accepts(s)
            elapsed = time.perf_counter() - started
            result.update({"accepted": accepted, "trace": nfa.trace(s)})
        else:
            pipe = store.model(lid, info["pipeline"])
            started = time.perf_counter()
            proba = float(pipe.predict_proba([s])[0, 1])
            elapsed = time.perf_counter() - started
            details = explain_string(pipe, s)
            accepted = proba >= 0.5
            result.update({"accepted": accepted, "probability": proba, "confidence": max(proba, 1 - proba), "ml": details})
    except MissingArtifact as exc:
        raise bad_request(str(exc), status=503) from None
    result.update({"truth": truth, "correct": accepted == truth, "time_ms": elapsed * 1e3})
    return result


def explain_disagreement(store: ArtifactStore, lang: Language, approach: str, s: str, result: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> str:
    """A short, honest reason why ``approach`` disagrees with the ground truth on ``s``."""
    info = APPROACH_INFO[approach]
    reasons: list[str] = []
    long = len(s) > MAX_TRAIN_LENGTH
    if info["family"] == "ml":
        if long:
            reasons.append(f"the string has {len(s)} symbols, longer than anything seen in training (max {MAX_TRAIN_LENGTH})")
        if lang.id == "L6":
            reasons.append("divisibility by 3 depends on where the 1s are, and no generic feature captures that")
        elif lang.id == "L10" and info["pipeline"] == "lr":
            reasons.append("the rule needs an interaction of two residues (#a mod 3 vs #b mod 3), which a linear model cannot express")
        elif "count" in lang.family or "parity" in lang.family or "modular" in lang.family:
            reasons.append("membership depends on counting modulo k, which the features only approximate")
        p = result.get("probability")
        if p is not None and abs(p - 0.5) < 0.15:
            reasons.append(f"the model is unsure (P(accept) = {p:.2f})")
        if not reasons:
            reasons.append("the generic features of this string resemble those of the opposite class in the training data")
    elif approach.startswith("lstar_"):
        source = by_id.get(f"ml_{info['pipeline']}")
        m = store.automaton_metrics(lang.id, approach) or {}
        if source is not None and not source.get("correct", True):
            reasons.append(f"it inherits the {PIPELINE_NAMES[info['pipeline']]}'s mistake - the DFA was extracted from that model")
        else:
            reasons.append("the extracted DFA only approximates its model on this string")
        if m and not m.get("converged", True):
            reasons.append(f"L* stopped at its state budget ({m.get('stop_reason')}), so the DFA is a bounded regular approximation")
    elif approach in ("rpni", "edsm"):
        reasons.append("the training sample did not pin down this part of the language, so the learner generalized differently")
    else:
        reasons.append("unexpected - ground-truth constructions are proven equivalent")
    text = "; ".join(reasons)
    return text[0].upper() + text[1:] + "."


def compare(store: ArtifactStore, lid: str, s: str) -> dict[str, Any]:
    lang = require_language(lid)
    validate_string(s, lang.alphabet)
    rows: list[dict[str, Any]] = []
    order = ["dfa", "nfa", "min_dfa", "ml_lr", "ml_dt", "ml_rf", "ml_stack", "lstar_lr", "lstar_dt", "lstar_rf", "lstar_stack", "rpni", "edsm"]
    by_id: dict[str, dict[str, Any]] = {}
    for approach in order:
        try:
            r = classify(store, lid, approach, s)
        except HTTPException as exc:
            if exc.status_code == 503:
                rows.append({"approach": approach, "name": APPROACH_INFO[approach]["name"], "family": APPROACH_INFO[approach]["family"], "available": False})
                continue
            raise
        slim = {k: r[k] for k in ("approach", "name", "family", "kind", "accepted", "truth", "correct", "time_ms")}
        if "probability" in r:
            slim["probability"] = r["probability"]
        if r["kind"] == "dfa":
            slim["final_state"] = r["trace"]["final"]
        if r["kind"] == "nfa":
            slim["final_states"] = r["trace"]["final"]
        slim["available"] = True
        by_id[approach] = slim
        rows.append(slim)
    for row in rows:
        if row.get("available") and not row["correct"]:
            row["explanation"] = explain_disagreement(store, lang, row["approach"], s, row, by_id)
    truth = lang.dfa.accepts(s)
    wrong = [r["approach"] for r in rows if r.get("available") and not r["correct"]]
    return {"language": lid, "string": s, "length": len(s), "truth": truth, "results": rows, "disagreements": wrong, "longer_than_training": len(s) > MAX_TRAIN_LENGTH}


# =============================================================================
# Live learning from user samples (Page 5)
# =============================================================================
class SessionStore:
    def __init__(self, capacity: int = 64) -> None:
        self.capacity = capacity
        self._items: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def put(self, session: dict[str, Any]) -> str:
        sid = uuid.uuid4().hex[:12]
        self._items[sid] = session
        while len(self._items) > self.capacity:
            self._items.popitem(last=False)
        return sid

    def get(self, sid: str) -> dict[str, Any]:
        if sid not in self._items:
            raise bad_request("This learning session has expired. Learn the automaton again.", status=404)
        self._items.move_to_end(sid)
        return self._items[sid]


SESSIONS = SessionStore()
ML_FOR_LEARNING = {"lr": {"C": 1.0, "l1_ratio": 0.0}, "dt": {}, "rf": {"n_estimators": 100}}


def _clean_samples(samples: list[Any], alphabet: str | None) -> tuple[tuple[str, ...], list[tuple[str, bool]], list[str]]:
    warnings_out: list[str] = []
    seen: dict[str, bool] = {}
    conflicts: list[str] = []
    for sample in samples:
        s = sample.string.strip()
        if s in ("ε", "eps", "λ"):
            s = ""
        if any(ch.isspace() for ch in s):
            raise bad_request(f"Sample {sample.string!r} contains whitespace. Use one string per line.")
        if s in seen and seen[s] != sample.label:
            conflicts.append(s)
        seen[s] = sample.label
    if conflicts:
        shown = ", ".join(repr(c) if c else "ε" for c in conflicts[:6])
        raise bad_request(f"Inconsistent samples: {shown} {'is' if len(conflicts) == 1 else 'are'} marked both accepted and rejected.", conflicts=conflicts)
    pairs = list(seen.items())
    if alphabet:
        symbols = tuple(dict.fromkeys(alphabet))
    else:
        symbols = tuple(sorted({ch for s, _ in pairs for ch in s}))
    if not symbols:
        raise bad_request("Add at least one non-empty string so the alphabet can be inferred.")
    if len(symbols) > 4:
        raise bad_request(f"Use at most 4 different symbols (found {len(symbols)}: {''.join(symbols)}).")
    for s, _ in pairs:
        validate_string(s, symbols)
    n_pos = sum(1 for _, y in pairs if y)
    n_neg = len(pairs) - n_pos
    if n_pos == 0 or n_neg == 0:
        raise bad_request("Add at least one accepted and one rejected string - a learner needs both to find a boundary.", positives=n_pos, negatives=n_neg)
    if len(pairs) < 8:
        warnings_out.append(f"Only {len(pairs)} distinct samples: the learned DFA is a guess that fits them, not necessarily the language you have in mind.")
    if min(n_pos, n_neg) < 3:
        warnings_out.append("Very few examples of one class - expect the learner to overgeneralize.")
    return symbols, pairs, warnings_out


def learn(req: Any) -> dict[str, Any]:
    symbols, pairs, notes = _clean_samples(req.samples, req.alphabet)
    strings = [s for s, _ in pairs]
    labels = np.array([int(y) for _, y in pairs])
    started = time.perf_counter()
    learner = req.learner
    stats: dict[str, Any] = {}
    models: dict[str, Any] = {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        for pid, params in ML_FOR_LEARNING.items():
            models[pid] = make_pipeline(pid, "".join(symbols), params, seed=42).fit(strings, labels)
    if learner in ("rpni", "edsm"):
        res = (rpni if learner == "rpni" else edsm)(symbols, pairs)
        dfa = res.dfa
        raw = res.raw_dfa.complete()
        stats = {"pta_states": res.pta_states, "merges": res.merges, "promotions": res.promotions, "raw_states": raw.num_states}
    else:
        pid = learner.split("_", 1)[1]
        pipe = models[pid]
        oracle = MembershipOracle(lambda xs: np.asarray(pipe.predict(list(xs))).astype(bool).tolist())
        max_len = max((len(s) for s in strings), default=4)
        eq = SamplingEquivalenceOracle(oracle, symbols, exhaustive_max_len=min(7, max_len + 1), random_samples=300, random_max_len=max_len + 4, extra=strings, seed=42)
        res_l = lstar(symbols, oracle, eq, max_states=24, max_seconds=5.0, max_rounds=30)
        raw = res_l.dfa
        dfa = hopcroft_minimize(raw)
        stats = {"membership_queries": res_l.membership_queries, "equivalence_queries": res_l.equivalence_queries, "converged": res_l.converged, "stop_reason": res_l.stop_reason, "raw_states": raw.num_states}
    elapsed = time.perf_counter() - started
    dfa = dfa.rename([f"q{i}" for i in range(dfa.num_states)])
    fits = sum(dfa.accepts(s) == bool(y) for s, y in pairs)
    ml_train_acc = {pid: float((m.predict(strings) == labels).mean()) for pid, m in models.items()}
    if learner.startswith("ml_") and fits < len(pairs):
        notes.append(f"The extracted DFA agrees with {fits}/{len(pairs)} samples because it mirrors the ML model, which itself fits {ml_train_acc[learner[3:]]:.0%} of them.")
    session = {"alphabet": symbols, "dfa": dfa, "models": models, "learner": learner}
    sid = SESSIONS.put(session)
    return {
        "session_id": sid,
        "learner": learner,
        "alphabet": list(symbols),
        "samples": len(pairs),
        "positives": int(labels.sum()),
        "negatives": int(len(labels) - labels.sum()),
        "automaton": dfa.to_dict(),
        "states": dfa.num_states,
        "minimized_from": stats.get("raw_states"),
        "fits_samples": fits,
        "learn_time_ms": elapsed * 1e3,
        "stats": stats,
        "ml_training_accuracy": ml_train_acc,
        "distinguishing_suffixes": [{"p": p, "q": q, "suffix": w} for (p, q), w in distinguishing_suffixes(dfa).items()],
        "warnings": notes,
    }


def learn_classify(sid: str, s: str) -> dict[str, Any]:
    session = SESSIONS.get(sid)
    validate_string(s, session["alphabet"])
    dfa: DFA = session["dfa"]
    started = time.perf_counter()
    accepted = dfa.accepts(s)
    elapsed = time.perf_counter() - started
    ml = {}
    for pid, model in session["models"].items():
        t0 = time.perf_counter()
        p = float(model.predict_proba([s])[0, 1])
        ml[pid] = {"name": PIPELINE_NAMES[pid], "probability": p, "accepted": p >= 0.5, "time_ms": (time.perf_counter() - t0) * 1e3}
    return {"string": s, "accepted": accepted, "trace": _dfa_trace(dfa, s), "time_ms": elapsed * 1e3, "ml": ml, "agreement": sum(v["accepted"] == accepted for v in ml.values())}
