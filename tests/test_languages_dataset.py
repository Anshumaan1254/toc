"""Language definitions agree with each other; dataset generation invariants hold."""

from __future__ import annotations

import re

import pandas as pd
import pytest

from src.automata.languages import LANGUAGES
from src.data.generate import Bucket, DatasetConfig, LanguageSampler, build_dataset
from src.data.io import load_dataset, save_dataset

from .conftest import strings_up_to


@pytest.mark.parametrize("lid", list(LANGUAGES))
def test_four_definitions_agree(lid: str) -> None:
    lang = LANGUAGES[lid]
    pattern = re.compile(lang.regex)
    for s in strings_up_to(lang.alphabet_str, 10):
        y = lang.dfa.accepts(s)
        assert y == lang.predicate(s) == lang.nfa.accepts(s) == bool(pattern.fullmatch(s)), (lid, s)


def test_uniform_sampler_only_returns_requested_class(rng) -> None:
    for lid in ("L5", "L8", "L9"):
        sampler = LanguageSampler(LANGUAGES[lid].dfa, 20, rng)
        for n in range(0, 21):
            for accepted in (True, False):
                s = sampler.sample(n, accepted)
                if sampler.count(n, accepted) == 0:
                    assert s is None
                else:
                    assert s is not None and len(s) == n and LANGUAGES[lid].dfa.accepts(s) == accepted


@pytest.fixture(scope="module")
def small_dataset():
    cfg = DatasetConfig(
        buckets=(
            Bucket(0, 5, "main", None),
            Bucket(6, 9, "main", 200),
            Bucket(21, 25, "long", 100),
        )
    )
    return build_dataset(cfg, languages=["L1", "L6", "L8"])


def test_dataset_invariants(small_dataset) -> None:
    df, report = small_dataset
    assert not df.duplicated(["language_id", "string"]).any()
    for lid, s, y in zip(df.language_id, df.string, df.label):
        assert LANGUAGES[lid].dfa.accepts(s) == bool(y)
    sampled = pd.DataFrame(report["per_bucket"]).query("balanced_by_design")
    assert (sampled.positives == sampled.negatives).all()
    assert set(df.loc[df.split_hint == "long", "length"]) <= set(range(21, 26))
    assert (df.groupby("language_id").string.apply(lambda s: (s == "").sum()) == 1).all()


def test_csv_round_trip_preserves_strings(small_dataset, tmp_path) -> None:
    df, _ = small_dataset
    path = tmp_path / "d.csv"
    save_dataset(df, path, None)
    back = load_dataset(path)
    assert back.equals(df)
    # digit-only strings and the alphabet "01" must stay text (not be parsed as integers)
    per_lang = back[back.string == "0011"].language_id.tolist()
    assert sorted(per_lang) == ["L1", "L6"]  # same string, two binary languages: legitimate
    assert set(back.alphabet) == {"01", "ab"}
    assert (back.string == "").sum() == 3
