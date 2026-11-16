"""Minimization (Hopcroft / Moore / Brzozowski), Myhill-Nerode table, product construction."""

from __future__ import annotations

import pytest

from src.automata.dfa import DFA
from src.automata.equivalence import are_equivalent, find_counterexample, product
from src.automata.languages import LANGUAGES
from src.automata.minimize import (
    brzozowski_minimize,
    distinguishing_suffixes,
    hopcroft_minimize,
    is_minimal,
    moore_minimize,
    moore_rounds,
)
from src.automata.nfa import subset_construction

from .conftest import random_dfa, strings_up_to

# Hand-derived minimal state counts (total DFA, trap state counted).
EXPECTED_MIN_STATES = {"L1": 2, "L2": 3, "L3": 4, "L4": 3, "L5": 3, "L6": 3, "L7": 4, "L8": 6, "L9": 8, "L10": 3}


@pytest.mark.parametrize("lid, expected", sorted(EXPECTED_MIN_STATES.items()))
def test_minimal_state_counts(lid: str, expected: int) -> None:
    lang = LANGUAGES[lid]
    subset_dfa, _ = subset_construction(lang.thompson_nfa)  # deliberately non-minimal input
    assert hopcroft_minimize(subset_dfa).num_states == expected
    assert moore_minimize(subset_dfa).num_states == expected
    assert brzozowski_minimize(subset_dfa).num_states == expected
    assert hopcroft_minimize(lang.dfa).num_states == expected


def test_spec_examples_l1_has_2_states_l2_has_3() -> None:
    assert hopcroft_minimize(LANGUAGES["L1"].dfa).num_states == 2
    assert hopcroft_minimize(LANGUAGES["L2"].dfa).num_states == 3


def test_minimizers_agree_and_preserve_language_on_random_dfas(rng) -> None:
    for _ in range(300):
        dfa = random_dfa(rng, partial=bool(rng.random() < 0.5))
        h = hopcroft_minimize(dfa)
        assert are_equivalent(h, dfa)
        assert h.signature() == moore_minimize(dfa).signature() == brzozowski_minimize(dfa).signature()
        assert hopcroft_minimize(h).signature() == h.signature()  # idempotent
        assert h.num_states <= dfa.complete().trim().num_states
        assert is_minimal(h)


def test_minimization_merges_redundant_states() -> None:
    # q1 and q2 are equivalent (both accepting sinks); q3 is unreachable.
    dfa = DFA("ab", [[1, 2], [1, 1], [2, 2], [0, 0]], 0, [1, 2])
    m = hopcroft_minimize(dfa)
    assert m.num_states == 2
    assert sorted(m.meta["groups"].values(), key=len)[-1] == ["q1", "q2"]


def test_moore_rounds_are_refinements() -> None:
    _, rounds = moore_rounds(subset_construction(LANGUAGES["L8"].thompson_nfa)[0])
    sizes = [len(r) for r in rounds]
    assert sizes == sorted(sizes) and sizes[0] == 2 and sizes[-1] == EXPECTED_MIN_STATES["L8"]


def test_distinguishing_suffixes_really_distinguish(rng) -> None:
    for _ in range(50):
        dfa = random_dfa(rng).complete().trim()
        name_to_q = {n: q for q, n in enumerate(dfa.names)}
        for (p, q), w in distinguishing_suffixes(dfa).items():
            fp = dfa.run(w, name_to_q[p])
            fq = dfa.run(w, name_to_q[q])
            assert (fp in dfa.accepting) != (fq in dfa.accepting)


def test_equivalence_checker_finds_shortest_counterexample(rng) -> None:
    for _ in range(100):
        a, b = random_dfa(rng, partial=True), random_dfa(rng, partial=True)
        w = find_counterexample(a, b)
        brute = next((s for s in strings_up_to("ab", 10) if a.accepts(s) != b.accepts(s)), None)
        if w is None:
            assert brute is None and are_equivalent(a, b)
        else:
            assert a.accepts(w) != b.accepts(w)
            if brute is not None:
                assert len(w) == len(brute)


def test_equivalence_of_different_presentations() -> None:
    l1 = LANGUAGES["L1"].dfa
    redundant = DFA("01", [[1, 2], [0, 3], [1, 2], [0, 3]], 0, [0, 2])  # 4-state presentation of L1
    assert are_equivalent(l1, redundant)
    assert not are_equivalent(l1, LANGUAGES["L4"].dfa)
    assert find_counterexample(l1, LANGUAGES["L4"].dfa) == "0"


def test_product_constructions() -> None:
    l1, l4 = LANGUAGES["L1"].dfa, LANGUAGES["L4"].dfa
    inter, union = product(l1, l4, "intersection"), product(l1, l4, "union")
    sym = product(l1, l4, "symmetric_difference")
    for s in strings_up_to("01", 8):
        a, b = l1.accepts(s), l4.accepts(s)
        assert inter.accepts(s) == (a and b)
        assert union.accepts(s) == (a or b)
        assert sym.accepts(s) == (a != b)
