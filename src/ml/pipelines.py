"""The four classification pipelines and their (small, documented) tuning grids.

P1 ``lr``    features -> StandardScaler -> LogisticRegression (saga; L1 or L2 via ``l1_ratio``)
P2 ``dt``    features -> DecisionTreeClassifier
P3 ``rf``    features -> RandomForestClassifier
P4 ``stack`` features -> StackingClassifier(LR, DT, RF; meta-learner LogisticRegression),
             base learners re-use the tuned P1-P3 settings; the meta-learner is trained on
             5-fold *out-of-fold* probabilities (sklearn's StackingClassifier ``cv``).

Model selection uses the validation split only: every grid point is fit on *train* and
scored on *validation* (F1 of the accepted class; ties -> accuracy -> simpler model).  The
selected model is **not** refit on train+validation, so the reported validation metrics
are honest and the test set is touched once, for the final report.
"""

from __future__ import annotations

import itertools
import time
import warnings
from typing import Any, Sequence

import numpy as np
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from .features import GenericStringFeatures

PIPELINE_IDS: tuple[str, ...] = ("lr", "dt", "rf", "stack")
PIPELINE_NAMES = {
    "lr": "Logistic Regression",
    "dt": "Decision Tree",
    "rf": "Random Forest",
    "stack": "Stacked ensemble",
}

GRIDS: dict[str, dict[str, list[Any]]] = {
    "lr": {"C": [0.01, 0.1, 1.0, 10.0], "l1_ratio": [0.0, 1.0]},
    "dt": {"max_depth": [4, 8, 16, None], "min_samples_leaf": [1, 5]},
    "rf": {"n_estimators": [100, 300], "max_depth": [12, None]},
    "stack": {"final_C": [0.1, 1.0, 10.0]},
}


def grid_points(kind: str) -> list[dict[str, Any]]:
    grid = GRIDS[kind]
    keys = list(grid)
    return [dict(zip(keys, values)) for values in itertools.product(*(grid[k] for k in keys))]


def _lr(params: dict[str, Any], seed: int) -> LogisticRegression:
    return LogisticRegression(
        C=params.get("C", 1.0), l1_ratio=params.get("l1_ratio", 0.0), solver="saga", max_iter=5000, tol=1e-3, random_state=seed
    )


def _dt(params: dict[str, Any], seed: int) -> DecisionTreeClassifier:
    return DecisionTreeClassifier(
        max_depth=params.get("max_depth"), min_samples_leaf=params.get("min_samples_leaf", 1), random_state=seed
    )


def _rf(params: dict[str, Any], seed: int) -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=params.get("n_estimators", 300),
        max_depth=params.get("max_depth"),
        max_features="sqrt",
        min_samples_leaf=1,
        random_state=seed,
        n_jobs=-1,
    )


def make_pipeline(
    kind: str,
    alphabet: str,
    params: dict[str, Any] | None = None,
    seed: int = 42,
    base_params: dict[str, dict[str, Any]] | None = None,
) -> Pipeline:
    """Build an unfitted pipeline.  ``base_params`` (tuned lr/dt/rf settings) feed the stack."""
    params = params or {}
    features = ("features", GenericStringFeatures(alphabet=alphabet))
    if kind == "lr":
        return Pipeline([features, ("scaler", StandardScaler()), ("model", _lr(params, seed))])
    if kind == "dt":
        return Pipeline([features, ("model", _dt(params, seed))])
    if kind == "rf":
        return Pipeline([features, ("model", _rf(params, seed))])
    if kind == "stack":
        base = base_params or {}
        stack = StackingClassifier(
            estimators=[
                ("lr", Pipeline([("scaler", StandardScaler()), ("model", _lr(base.get("lr", {}), seed))])),
                ("dt", _dt(base.get("dt", {}), seed)),
                ("rf", _rf(base.get("rf", {}), seed)),
            ],
            final_estimator=LogisticRegression(C=params.get("final_C", 1.0), max_iter=5000, random_state=seed),
            cv=StratifiedKFold(n_splits=params.get("cv", 5), shuffle=True, random_state=seed),
            stack_method="predict_proba",
            passthrough=False,
        )
        return Pipeline([features, ("model", stack)])
    raise ValueError(f"unknown pipeline kind {kind!r}")


def tune_pipeline(
    kind: str,
    alphabet: str,
    X_train: Sequence[str],
    y_train: np.ndarray,
    X_val: Sequence[str],
    y_val: np.ndarray,
    seed: int = 42,
    base_params: dict[str, dict[str, Any]] | None = None,
) -> tuple[Pipeline, dict[str, Any], list[dict[str, Any]]]:
    """Fit every grid point on train, score on validation, return the best fitted pipeline."""
    from .evaluate import complexity_size  # local import avoids a cycle

    records: list[dict[str, Any]] = []
    best: tuple[tuple[float, float, float], Pipeline, dict[str, Any]] | None = None
    for params in grid_points(kind):
        pipe = make_pipeline(kind, alphabet, params, seed, base_params)
        started = time.perf_counter()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            pipe.fit(X_train, y_train)
        fit_s = time.perf_counter() - started
        pred = pipe.predict(X_val)
        f1 = float(f1_score(y_val, pred, zero_division=0))
        acc = float(accuracy_score(y_val, pred))
        size = complexity_size(pipe)
        records.append({"params": params, "val_f1": f1, "val_accuracy": acc, "fit_seconds": fit_s, "complexity": size})
        key = (f1, acc, -float(size))
        if best is None or key > best[0]:
            best = (key, pipe, params)
    assert best is not None
    return best[1], best[2], records
