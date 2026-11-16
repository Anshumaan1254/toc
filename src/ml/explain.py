"""Human-readable views of the trained pipelines (global and per-string).

* :func:`explain_pipeline` - exported to ``artifacts/explain/*.json`` for the website:
  LR coefficients, decision-tree structure, random-forest importances, stack weights.
* :func:`explain_string`   - used live by the backend: the features of one string, its
  probability, and what drove the decision (LR contributions, the tree's decision path,
  RF importances x feature values, the stack's base-learner probabilities).
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier


def _names(pipe: Pipeline) -> list[str]:
    return [str(n) for n in pipe.named_steps["features"].get_feature_names_out()]


def _top(names: list[str], values: np.ndarray, k: int, signed: bool = False) -> list[dict[str, Any]]:
    order = np.argsort(-np.abs(values) if signed else -values)[:k]
    return [{"feature": names[i], "value": float(values[i])} for i in order if values[i] != 0]


def tree_structure(tree: DecisionTreeClassifier, names: list[str], max_depth: int = 5) -> dict[str, Any]:
    t = tree.tree_

    def node(i: int, depth: int) -> dict[str, Any]:
        counts = t.value[i][0]
        total = counts.sum()
        p_accept = float(counts[1] / total) if total else 0.0
        out: dict[str, Any] = {
            "id": int(i),
            "samples": int(t.n_node_samples[i]),
            "p_accept": round(p_accept, 4),
            "prediction": int(p_accept >= 0.5),
        }
        left, right = int(t.children_left[i]), int(t.children_right[i])
        if left == -1:
            out["leaf"] = True
            return out
        out["feature"] = names[int(t.feature[i])]
        out["threshold"] = float(t.threshold[i])
        if depth >= max_depth:
            out["truncated"] = True
            return out
        out["left"] = node(left, depth + 1)  # feature <= threshold
        out["right"] = node(right, depth + 1)
        return out

    return node(0, 0)


def explain_pipeline(pipe: Pipeline, top_k: int = 20) -> dict[str, Any]:
    names = _names(pipe)
    model = pipe.named_steps["model"]
    if isinstance(model, LogisticRegression):
        coef = model.coef_.ravel()
        return {
            "type": "logistic_regression",
            "intercept": float(model.intercept_[0]),
            "nonzero": int(np.count_nonzero(coef)),
            "top_coefficients": _top(names, coef, top_k, signed=True),
            "note": "coefficients on standardized features; positive pushes towards ACCEPT",
        }
    if isinstance(model, DecisionTreeClassifier):
        return {
            "type": "decision_tree",
            "depth": int(model.get_depth()),
            "nodes": int(model.tree_.node_count),
            "leaves": int(model.get_n_leaves()),
            "top_importances": _top(names, model.feature_importances_, top_k),
            "tree": tree_structure(model, names),
        }
    if isinstance(model, RandomForestClassifier):
        std = np.std([t.feature_importances_ for t in model.estimators_], axis=0)
        top = _top(names, model.feature_importances_, top_k)
        for item in top:
            item["std"] = float(std[names.index(item["feature"])])
        return {"type": "random_forest", "trees": len(model.estimators_), "top_importances": top}
    if isinstance(model, StackingClassifier):
        meta = model.final_estimator_
        base_names = list(model.named_estimators_)
        parts: dict[str, Any] = {}
        for name, est in model.named_estimators_.items():
            inner = est.named_steps["model"] if isinstance(est, Pipeline) else est
            if isinstance(inner, LogisticRegression):
                parts[name] = {"type": "logistic_regression", "top_coefficients": _top(names, inner.coef_.ravel(), 10, signed=True)}
            else:
                parts[name] = {"type": type(inner).__name__, "top_importances": _top(names, inner.feature_importances_, 10)}
        return {
            "type": "stacking",
            "meta_intercept": float(meta.intercept_[0]),
            "meta_weights": [{"base_learner": n, "weight": float(w)} for n, w in zip(base_names, meta.coef_.ravel())],
            "base_learners": parts,
            "note": "the meta-learner combines each base learner's P(accept), learned on out-of-fold predictions",
        }
    raise TypeError(f"unsupported model {type(model).__name__}")


def explain_string(pipe: Pipeline, s: str, top_k: int = 8) -> dict[str, Any]:
    """Features of ``s`` and the main reasons behind the pipeline's verdict."""
    features = pipe.named_steps["features"]
    names = _names(pipe)
    x = features.transform([s])
    row = x[0]
    proba = float(pipe.predict_proba([s])[0, 1])
    model = pipe.named_steps["model"]
    nonzero = [{"feature": names[i], "value": float(row[i])} for i in np.flatnonzero(row)]
    out: dict[str, Any] = {"probability": proba, "verdict": proba >= 0.5, "active_features": nonzero[:60], "n_features": len(names)}
    if isinstance(model, LogisticRegression):
        z = pipe.named_steps["scaler"].transform(x)[0]
        contrib = model.coef_.ravel() * z
        order = np.argsort(-np.abs(contrib))[:top_k]
        out["drivers"] = [
            {"feature": names[i], "value": float(row[i]), "contribution": float(contrib[i])} for i in order if contrib[i] != 0
        ]
        out["logit"] = float(contrib.sum() + model.intercept_[0])
    elif isinstance(model, DecisionTreeClassifier):
        t = model.tree_
        path = []
        node = 0
        while t.children_left[node] != -1:
            f, thr = int(t.feature[node]), float(t.threshold[node])
            go_left = row[f] <= thr
            path.append({"feature": names[f], "value": float(row[f]), "threshold": thr, "goes": "<=" if go_left else ">"})
            node = int(t.children_left[node] if go_left else t.children_right[node])
        out["decision_path"] = path
    elif isinstance(model, RandomForestClassifier):
        imp = model.feature_importances_
        order = np.argsort(-imp)[:top_k]
        out["drivers"] = [{"feature": names[i], "value": float(row[i]), "importance": float(imp[i])} for i in order]
        votes = np.array([t.predict(x)[0] for t in model.estimators_])
        out["tree_votes"] = {"accept": int((votes == 1).sum()), "reject": int((votes == 0).sum())}
    elif isinstance(model, StackingClassifier):
        base = {}
        for name, est in model.named_estimators_.items():
            base[name] = float(est.predict_proba(x)[0, 1])
        out["base_probabilities"] = base
        out["meta_weights"] = dict(zip(model.named_estimators_, model.final_estimator_.coef_.ravel().astype(float).tolist()))
    return out
