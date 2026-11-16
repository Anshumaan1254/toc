"""L*, RPNI and EDSM."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from src.automata.equivalence import are_equivalent
from src.automata.languages import LANGUAGES
from src.automata.learners import (
    ExactEquivalenceOracle,
    MembershipOracle,
    SamplingEquivalenceOracle,
    consistent_with,
    edsm,
    lstar,
    rpni,
)
from src.automata.minimize import hopcroft_minimize

from .conftest import random_dfa, strings_up_to


@pytest.mark.parametrize("mode", ["angluin", "suffixes"])
@pytest.mark.parametrize("lid", list(LANGUAGES))
def test_lstar_recovers_every_language_exactly(lid: str, mode: str) -> None:
    lang = LANGUAGES[lid]
    result = lstar(lang.alphabet, MembershipOracle.from_dfa(lang.dfa), ExactEquivalenceOracle(lang.dfa), counterexample_mode=mode)
    assert result.converged and result.stop_reason == "equivalent"
    assert are_equivalent(result.dfa, lang.dfa)
    assert result.dfa.num_states == lang.expected_min_states  # L* hypotheses are minimal


def test_lstar_hypothesis_is_minimal_on_random_targets(rng) -> None:
    for _ in range(40):
        target = random_dfa(rng, n_max=8)
        result = lstar(("a", "b"), MembershipOracle.from_dfa(target), ExactEquivalenceOracle(target))
        assert are_equivalent(result.dfa, target)
        assert result.dfa.num_states == hopcroft_minimize(target).num_states


def test_lstar_with_sampling_teacher_small_languages() -> None:
    for lid in ("L1", "L2", "L5", "L7"):
        lang = LANGUAGES[lid]
        oracle = MembershipOracle.from_dfa(lang.dfa)
        eq = SamplingEquivalenceOracle(oracle, lang.alphabet, exhaustive_max_len=8, random_samples=300, random_max_len=25)
        result = lstar(lang.alphabet, oracle, eq)
        assert result.converged and are_equivalent(result.dfa, lang.dfa)


def test_lstar_respects_state_budget_on_non_regular_oracle() -> None:
    """#0 > #1 is not regular: L* must stop within budget and say it did not converge."""
    oracle = MembershipOracle(lambda strings: [s.count("0") > s.count("1") for s in strings])
    eq = SamplingEquivalenceOracle(oracle, "01", exhaustive_max_len=10, random_samples=200, random_max_len=30)
    result = lstar(("0", "1"), oracle, eq, max_states=10, max_rounds=50)
    assert not result.converged
    assert result.stop_reason in {"max_states", "max_rounds"}
    assert result.dfa.num_states <= 10


def test_membership_oracle_batches_and_caches() -> None:
    calls = []

    def fn(strings):
        calls.append(len(strings))
        return [len(s) % 2 == 0 for s in strings]

    oracle = MembershipOracle(fn, batch_size=3)
    assert oracle.query(["", "a", "ab", "abc", "a"]) == [True, False, True, False, False]
    assert calls == [3, 1]  # 4 unique strings in two batches
    oracle.query(["ab", "abc"])
    assert calls == [3, 1] and oracle.unique_queries == 4


def _sample(target, rng, n=300, max_len=12):
    strings = {""}
    while len(strings) < n:
        k = int(rng.integers(0, max_len + 1))
        strings.add("".join(rng.choice(list(target.alphabet), size=k)))
    return [(s, target.accepts(s)) for s in sorted(strings)]


@pytest.mark.parametrize("learner", [rpni, edsm])
def test_passive_learners_are_consistent_with_training_data(learner, rng) -> None:
    for _ in range(30):
        target = random_dfa(rng, n_max=6)
        samples = _sample(target, rng)
        result = learner(target.alphabet, samples)
        assert consistent_with(result.dfa, samples)
        assert consistent_with(result.raw_dfa.complete(), samples)


@pytest.mark.parametrize("learner", [rpni, edsm])
def test_passive_learners_identify_target_from_characteristic_sample(learner, rng) -> None:
    """All strings up to length n0 + 3 form a characteristic sample for small targets."""
    for _ in range(15):
        target = hopcroft_minimize(random_dfa(rng, n_max=4))
        samples = [(s, target.accepts(s)) for s in strings_up_to("ab", target.num_states + 4)]
        result = learner(target.alphabet, samples)
        assert are_equivalent(result.dfa, target)


@pytest.mark.parametrize("lid", ["L1", "L3", "L7", "L9"])
def test_rpni_on_exhaustive_short_strings(lid: str) -> None:
    lang = LANGUAGES[lid]
    samples = [(s, lang.dfa.accepts(s)) for s in strings_up_to(lang.alphabet_str, 9)]
    assert are_equivalent(rpni(lang.alphabet, samples).dfa, lang.dfa)


def test_inconsistent_sample_is_rejected() -> None:
    with pytest.raises(ValueError):
        rpni("ab", [("ab", 1), ("ab", 0)])
