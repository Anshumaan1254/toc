"""Feature transformer, pipelines, complexity and explanations."""

from __future__ import annotations

import itertools

import numpy as np
import pandas as pd
import pytest

from src.automata.languages import LANGUAGES
from src.ml.evaluate import classification_metrics, model_complexity
from src.ml.explain import explain_pipeline, explain_string
from src.ml.features import GenericStringFeatures
from src.ml.pipelines import PIPELINE_IDS, make_pipeline


def reference_features(s: str, alphabet: str = "01") -> dict[str, float]:
    """Slow, obviously-correct re-implementation used to check the vectorized transformer."""
    f: dict[str, float] = {"len": len(s), "is_empty": float(s == "")}
    for n in range(1, 5):
        for t in itertools.product(alphabet, repeat=n):
            w = "".join(t)
            c = sum(1 for i in range(len(s) - n + 1) if s[i : i + n] == w)
            f[f"count({w})" if n == 1 else f"ngram({w})"] = c
    for a in alphabet:
        f[f"ratio({a})"] = s.count(a) / max(len(s), 1)
    for side in ("first", "last"):
        for i in range(6):
            sym = (s[i] if side == "first" else s[-1 - i]) if i < len(s) else "none"
            for a in [*alphabet, "none"]:
                f[f"{side}[{i + 1}]={a}"] = float(sym == a)
    for side in ("prefix", "suffix"):
        for m in (2, 3):
            for t in itertools.product(alphabet, repeat=m):
                w = "".join(t)
                f[f"{side}={w}"] = float(len(s) >= m and (s[:m] if side == "prefix" else s[-m:]) == w)
    for a in alphabet:
        runs = "".join(c if c == a else " " for c in s).split()
        f[f"max_run({a})"] = max((len(r) for r in runs), default=0)
    f["changes"] = sum(1 for i in range(1, len(s)) if s[i] != s[i - 1])
    for q, v in [(f"count({a})", s.count(a)) for a in alphabet] + [("len", len(s))]:
        for m in (2, 3, 4):
            for r in range(m):
                f[f"{q}%{m}={r}"] = float(v % m == r)
    return f


def test_vectorized_features_match_reference(rng) -> None:
    strings = ["", "0", "1", "0110", "111000"] + ["".join(rng.choice(["0", "1"], size=int(n))) for n in rng.integers(0, 41, 300)]
    tf = GenericStringFeatures("01").fit(strings)
    X = tf.transform(strings)
    names = list(tf.get_feature_names_out())
    assert X.shape == (len(strings), 124)
    for i, s in enumerate(strings):
        ref = reference_features(s)
        assert set(ref) == set(names)
        np.testing.assert_allclose(X[i], [ref[n] for n in names], err_msg=s)


def test_features_accept_series_and_reject_bad_input() -> None:
    tf = GenericStringFeatures("ab").fit(["ab"])
    assert tf.transform(pd.Series(["ab", ""], dtype=str)).shape == (2, 124)
    with pytest.raises(TypeError):
        tf.transform(["ab", float("nan")])
    with pytest.raises(ValueError):
        tf.transform(["abc"])
    with pytest.raises(TypeError):
        tf.transform("ab")


def test_metrics_and_confusion() -> None:
    m = classification_metrics(np.array([0, 0, 1, 1]), np.array([0, 1, 1, 1]), np.array([0.1, 0.6, 0.8, 0.9]))
    assert m["accuracy"] == 0.75 and m["confusion"] == {"tn": 1, "fp": 1, "fn": 0, "tp": 2}
    assert m["roc_auc"] == 1.0


@pytest.fixture(scope="module")
def tiny_l3():
    lang = LANGUAGES["L3"]
    strings = ["".join(t) for n in range(0, 9) for t in itertools.product("01", repeat=n)]
    y = np.array([lang.dfa.accepts(s) for s in strings], dtype=int)
    return strings, y


@pytest.mark.parametrize("kind", PIPELINE_IDS)
def test_pipelines_fit_predict_explain(kind: str, tiny_l3) -> None:
    X, y = tiny_l3
    params = {"n_estimators": 20} if kind == "rf" else {}
    base = {"rf": {"n_estimators": 20}}
    pipe = make_pipeline(kind, "01", params, seed=42, base_params=base).fit(X, y)
    assert (pipe.predict(X) == y).mean() > 0.9  # "contains 101" is easy for the generic features
    assert model_complexity(pipe)["size"] > 0
    assert explain_pipeline(pipe)["type"]
    info = explain_string(pipe, "0101")
    assert 0.0 <= info["probability"] <= 1.0 and info["verdict"] == (info["probability"] >= 0.5)
