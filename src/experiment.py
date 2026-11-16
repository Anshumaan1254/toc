"""Per-language experiment orchestration (used by notebook 02 and by the backend).

* :func:`train_language`   - tune P1-P4 on train/validation, evaluate on val / test / long,
  time training and inference, measure complexity.
* :func:`learn_automata`   - L* extraction from every trained pipeline, RPNI and EDSM on the
  training strings, each minimized and compared with the ground truth.
* :func:`sample_efficiency` - learning curves: passive learners vs ML on growing training sets.
"""

from __future__ import annotations

import time
import warnings
from typing import Any

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.pipeline import Pipeline

from .automata.dfa import DFA
from .automata.equivalence import find_counterexample
from .automata.languages import Language
from .automata.learners import edsm, rpni
from .automata.minimize import hopcroft_minimize
from .ml.distill import ExtractionConfig, extract_dfa
from .ml.evaluate import (
    classification_metrics,
    dfa_complexity,
    evaluate_dfa,
    evaluate_pipeline,
    model_complexity,
    single_string_latency,
)
from .ml.pipelines import PIPELINE_IDS, make_pipeline, tune_pipeline

SPLIT_NAMES = ("train", "val", "test", "long")


def language_parts(splits: pd.DataFrame, language_id: str) -> dict[str, pd.DataFrame]:
    g = splits[splits.language_id == language_id]
    return {name: g[g.split == name] for name in SPLIT_NAMES}


def xy(frame: pd.DataFrame) -> tuple[list[str], np.ndarray]:
    return frame.string.tolist(), frame.label.to_numpy().astype(int)


def train_language(lang: Language, splits: pd.DataFrame, seed: int = 42) -> tuple[dict[str, Pipeline], dict[str, Any]]:
    parts = language_parts(splits, lang.id)
    X_tr, y_tr = xy(parts["train"])
    X_va, y_va = xy(parts["val"])
    pipes: dict[str, Pipeline] = {}
    results: dict[str, Any] = {}
    tuned: dict[str, dict[str, Any]] = {}
    for kind in PIPELINE_IDS:
        started = time.perf_counter()
        pipe, params, records = tune_pipeline(kind, lang.alphabet_str, X_tr, y_tr, X_va, y_va, seed, base_params=tuned)
        tuning_s = time.perf_counter() - started
        if kind != "stack":
            tuned[kind] = params
        # Training cost of the final model = the recorded fit time of the selected grid point.
        train_s = next(r["fit_seconds"] for r in records if r["params"] == params)
        evals = {name: evaluate_pipeline(pipe, *xy(parts[name])) for name in ("val", "test", "long")}
        results[kind] = {
            "best_params": params,
            "tuning": records,
            "tuning_time_s": tuning_s,
            "train_time_s": train_s,
            **evals,
            "generalization_drop": evals["test"]["accuracy"] - evals["long"]["accuracy"],
            "inference_time_per_string_s": evals["test"]["inference_time_per_string_s"],
            "single_string_latency_s": single_string_latency(pipe.predict, X_va),
            "complexity": model_complexity(pipe),
        }
        pipes[kind] = pipe
    return pipes, results


def _truth_comparison(dfa: DFA, truth: DFA) -> dict[str, Any]:
    cex = find_counterexample(dfa, truth)
    return {"equivalent_to_truth": cex is None, "counterexample_to_truth": cex}


def evaluate_learned_dfa(
    dfa: DFA, lang: Language, parts: dict[str, pd.DataFrame], model_preds: dict[str, np.ndarray] | None = None
) -> dict[str, Any]:
    out: dict[str, Any] = {**dfa_complexity(dfa), **_truth_comparison(dfa, lang.dfa)}
    for name in ("test", "long"):
        X, y = xy(parts[name])
        metrics = evaluate_dfa(dfa, X, y)
        if model_preds is not None:
            pred = np.fromiter((dfa.accepts(s) for s in X), dtype=int, count=len(X))
            metrics["fidelity"] = float((pred == model_preds[name]).mean())
        out[name] = metrics
    out["inference_time_per_string_s"] = out["test"]["inference_time_per_string_s"]
    return out


def learn_automata(
    lang: Language,
    splits: pd.DataFrame,
    pipes: dict[str, Pipeline],
    config: ExtractionConfig = ExtractionConfig(),
    seed: int = 42,
) -> tuple[dict[str, DFA], dict[str, Any], dict[str, Any]]:
    """Return (learned DFAs, metrics per approach, raw learning traces per approach)."""
    parts = language_parts(splits, lang.id)
    X_tr, y_tr = xy(parts["train"])
    dfas: dict[str, DFA] = {}
    metrics: dict[str, Any] = {}
    traces: dict[str, Any] = {}

    # Ground truth for reference (the hand-built DFA, already minimal).
    truth = hopcroft_minimize(lang.dfa)
    metrics["dfa"] = evaluate_learned_dfa(truth, lang, parts)

    for kind, pipe in pipes.items():
        preds = {name: np.asarray(pipe.predict(xy(parts[name])[0])).astype(int) for name in ("test", "long")}
        dfa, result, _ = extract_dfa(pipe, lang.alphabet, X_tr, config, seed)
        approach = f"lstar_{kind}"
        dfas[approach] = dfa
        rec = evaluate_learned_dfa(dfa, lang, parts, preds)
        rec.update(
            {
                "membership_queries": result.membership_queries,
                "equivalence_queries": result.equivalence_queries,
                "learning_time_s": result.seconds,
                "converged": result.converged,
                "stop_reason": result.stop_reason,
                "raw_states": result.dfa.num_states,
                "counterexamples": len(result.counterexamples),
                "closedness_fixes": result.closedness_fixes,
                "consistency_fixes": result.consistency_fixes,
                "table_shape": result.table_shape,
            }
        )
        metrics[approach] = rec
        traces[approach] = {
            **result.summary(),
            "rounds": result.rounds,
            "counterexamples": result.counterexamples[:50],
            "eq_strings_tested": dfa.meta.get("eq_strings_tested"),
        }

    samples = list(zip(X_tr, y_tr))
    for name, learner in (("rpni", rpni), ("edsm", edsm)):
        res = learner(lang.alphabet, samples)
        dfas[name] = res.dfa
        rec = evaluate_learned_dfa(res.dfa, lang, parts)
        rec.update(
            {
                "membership_queries": None,
                "equivalence_queries": None,
                "learning_time_s": res.seconds,
                "converged": True,
                "stop_reason": "no blue states left",
                "raw_states": res.raw_dfa.num_states,
                "pta_states": res.pta_states,
                "merges": res.merges,
                "promotions": res.promotions,
                "merge_attempts": res.merge_attempts,
                "consistent_with_training": all(res.dfa.accepts(s) == bool(y) for s, y in samples),
            }
        )
        metrics[name] = rec
        traces[name] = res.summary()
    return dfas, metrics, traces


def sample_efficiency(
    lang: Language,
    splits: pd.DataFrame,
    best_params: dict[str, dict[str, Any]],
    fractions: tuple[float, ...] = (0.01, 0.03, 0.1, 0.3, 1.0),
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Train RPNI, EDSM, LR, DT and RF on growing stratified subsets of the training split."""
    parts = language_parts(splits, lang.id)
    train = parts["train"]
    rows: list[dict[str, Any]] = []
    for frac in fractions:
        if frac < 1.0:
            sub = train.groupby("label", group_keys=False).sample(frac=frac, random_state=seed)
        else:
            sub = train
        X, y = xy(sub)
        if len(set(y)) < 2:
            continue
        for name in ("rpni", "edsm"):
            res = (rpni if name == "rpni" else edsm)(lang.alphabet, zip(X, y))
            for split in ("test", "long"):
                Xs, ys = xy(parts[split])
                pred = np.fromiter((res.dfa.accepts(s) for s in Xs), dtype=int, count=len(Xs))
                rows.append({"language": lang.id, "fraction": frac, "n_train": len(X), "approach": name, "split": split, "accuracy": float((pred == ys).mean()), "states": res.dfa.num_states})
        for kind in ("lr", "dt", "rf"):
            pipe = make_pipeline(kind, lang.alphabet_str, best_params.get(kind, {}), seed)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ConvergenceWarning)
                pipe.fit(X, y)
            for split in ("test", "long"):
                Xs, ys = xy(parts[split])
                rows.append({"language": lang.id, "fraction": frac, "n_train": len(X), "approach": kind, "split": split, "accuracy": float((pipe.predict(Xs) == ys).mean()), "states": None})
    return rows


def summarize_ml(ml: dict[str, dict[str, Any]]) -> pd.DataFrame:
    """Long table: one row per (language, pipeline) with the headline numbers."""
    rows = []
    for lid, per in ml.items():
        for kind, r in per.items():
            rows.append(
                {
                    "language": lid,
                    "pipeline": kind,
                    "val_accuracy": r["val"]["accuracy"],
                    "val_f1": r["val"]["f1"],
                    "test_accuracy": r["test"]["accuracy"],
                    "test_precision": r["test"]["precision"],
                    "test_recall": r["test"]["recall"],
                    "test_f1": r["test"]["f1"],
                    "test_roc_auc": r["test"]["roc_auc"],
                    "long_accuracy": r["long"]["accuracy"],
                    "long_f1": r["long"]["f1"],
                    "generalization_drop": r["generalization_drop"],
                    "train_time_s": r["train_time_s"],
                    "inference_us_per_string": r["inference_time_per_string_s"] * 1e6,
                    "complexity": r["complexity"]["size"],
                }
            )
    return pd.DataFrame(rows)


def summarize_automata(auto: dict[str, dict[str, Any]]) -> pd.DataFrame:
    rows = []
    for lid, per in auto.items():
        for approach, r in per.items():
            rows.append(
                {
                    "language": lid,
                    "approach": approach,
                    "states": r["states"],
                    "test_accuracy": r["test"]["accuracy"],
                    "long_accuracy": r["long"]["accuracy"],
                    "fidelity_test": r["test"].get("fidelity"),
                    "fidelity_long": r["long"].get("fidelity"),
                    "equivalent_to_truth": r["equivalent_to_truth"],
                    "membership_queries": r.get("membership_queries"),
                    "learning_time_s": r.get("learning_time_s"),
                    "converged": r.get("converged"),
                    "stop_reason": r.get("stop_reason"),
                }
            )
    return pd.DataFrame(rows)


__all__ = [
    "classification_metrics",
    "language_parts",
    "learn_automata",
    "sample_efficiency",
    "summarize_automata",
    "summarize_ml",
    "train_language",
    "xy",
]
