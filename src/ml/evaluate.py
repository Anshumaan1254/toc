"""Metrics, timing and model-complexity measurements for pipelines and automata."""

from __future__ import annotations

import time
from typing import Any, Callable, Sequence

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline

from ..automata.dfa import DFA


def classification_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_score: np.ndarray | None = None) -> dict[str, Any]:
    """Accuracy, precision/recall/F1 (accepted class), balanced accuracy, ROC-AUC, confusion matrix."""
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    out: dict[str, Any] = {
        "n": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)) if len(set(y_true)) > 1 else None,
        "confusion": {"tn": int(cm[0, 0]), "fp": int(cm[0, 1]), "fn": int(cm[1, 0]), "tp": int(cm[1, 1])},
        "roc_auc": None,
    }
    if y_score is not None and len(set(y_true)) > 1:
        out["roc_auc"] = float(roc_auc_score(y_true, y_score))
    return out


def evaluate_pipeline(pipe: Pipeline, X: Sequence[str], y: np.ndarray) -> dict[str, Any]:
    X = list(X)
    started = time.perf_counter()
    proba = pipe.predict_proba(X)[:, 1]
    elapsed = time.perf_counter() - started
    pred = (proba >= 0.5).astype(int)
    metrics = classification_metrics(y, pred, proba)
    metrics["inference_time_per_string_s"] = elapsed / max(len(X), 1)
    return metrics


def evaluate_dfa(dfa: DFA, X: Sequence[str], y: np.ndarray, reference: Callable[[str], bool] | None = None) -> dict[str, Any]:
    """Accuracy etc. of a DFA on labelled strings (+ agreement with ``reference`` if given)."""
    X = list(X)
    started = time.perf_counter()
    pred = np.fromiter((dfa.accepts(s) for s in X), dtype=int, count=len(X))
    elapsed = time.perf_counter() - started
    metrics = classification_metrics(y, pred)
    metrics["inference_time_per_string_s"] = elapsed / max(len(X), 1)
    if reference is not None:
        ref = np.fromiter((reference(s) for s in X), dtype=int, count=len(X))
        metrics["fidelity"] = float((ref == pred).mean()) if len(X) else None
    return metrics


def single_string_latency(predict: Callable[[list[str]], Any], sample: Sequence[str], repeats: int = 30) -> float:
    """Median wall-clock time to classify one string at a time (interactive use)."""
    times = []
    for i in range(repeats):
        s = [sample[i % len(sample)]]
        started = time.perf_counter()
        predict(s)
        times.append(time.perf_counter() - started)
    return float(np.median(times))


def _estimator(pipe: Pipeline) -> Any:
    return pipe.named_steps["model"]


def _tree_info(tree: Any) -> dict[str, int]:
    return {"depth": int(tree.get_depth()), "nodes": int(tree.tree_.node_count), "leaves": int(tree.get_n_leaves())}


def model_complexity(pipe: Pipeline) -> dict[str, Any]:
    """LR: non-zero coefficients · DT: depth / nodes · RF: trees / total nodes · stack: sum of parts."""
    from sklearn.ensemble import RandomForestClassifier, StackingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.tree import DecisionTreeClassifier

    model = _estimator(pipe)
    n_features = int(len(pipe.named_steps["features"].get_feature_names_out()))

    def lr_info(m: LogisticRegression) -> dict[str, Any]:
        nz = int(np.count_nonzero(m.coef_))
        return {"type": "logistic_regression", "nonzero_coefficients": nz, "features": n_features, "size": nz + 1}

    def rf_info(m: RandomForestClassifier) -> dict[str, Any]:
        nodes = [int(t.tree_.node_count) for t in m.estimators_]
        depths = [int(t.get_depth()) for t in m.estimators_]
        return {
            "type": "random_forest",
            "trees": len(m.estimators_),
            "total_nodes": int(sum(nodes)),
            "mean_depth": float(np.mean(depths)),
            "max_depth": int(max(depths)),
            "size": int(sum(nodes)),
        }

    if isinstance(model, LogisticRegression):
        return lr_info(model)
    if isinstance(model, DecisionTreeClassifier):
        info = _tree_info(model)
        return {"type": "decision_tree", **info, "size": info["nodes"]}
    if isinstance(model, RandomForestClassifier):
        return rf_info(model)
    if isinstance(model, StackingClassifier):
        parts: dict[str, Any] = {}
        for name, est in model.named_estimators_.items():
            inner = est.named_steps["model"] if isinstance(est, Pipeline) else est
            if isinstance(inner, LogisticRegression):
                parts[name] = lr_info(inner)
            elif isinstance(inner, DecisionTreeClassifier):
                t = _tree_info(inner)
                parts[name] = {"type": "decision_tree", **t, "size": t["nodes"]}
            else:
                parts[name] = rf_info(inner)
        meta = model.final_estimator_
        meta_size = int(np.count_nonzero(meta.coef_)) + 1
        parts["meta"] = {"type": "logistic_regression", "coefficients": meta.coef_.ravel().tolist(), "size": meta_size}
        return {"type": "stacking", "parts": parts, "size": int(sum(p["size"] for p in parts.values()))}
    raise TypeError(f"unsupported model {type(model).__name__}")


def complexity_size(pipe: Pipeline) -> int:
    return int(model_complexity(pipe)["size"])


def dfa_complexity(dfa: DFA) -> dict[str, int]:
    total = dfa.complete()
    return {"states": total.num_states, "transitions": total.num_transitions, "size": total.num_transitions}
