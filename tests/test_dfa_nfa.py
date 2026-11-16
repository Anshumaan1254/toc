"""DFA / NFA acceptance, ε-closure, subset construction and Thompson's construction."""

from __future__ import annotations

import pytest

from src.automata.dfa import DFA
from src.automata.equivalence import are_equivalent
from src.automata.languages import LANGUAGES
from src.automata.nfa import NFA, subset_construction
from src.automata.regex import RegexSyntaxError, thompson

from .conftest import random_dfa, strings_up_to


# ----------------------------------------------------------------------------- DFA
@pytest.mark.parametrize(
    "lid, accepted, rejected",
    [
        ("L1", ["", "1", "00", "0110", "1001"], ["0", "000", "10", "01111"]),
        ("L2", ["01", "1101", "0001"], ["", "0", "1", "10", "011"]),
        ("L3", ["101", "0101", "11011"], ["", "1001", "110011", "0000"]),
        ("L4", ["", "0", "111", "010101"], ["1", "11", "1111"]),
        ("L5", ["", "1", "0101", "10010"], ["11", "0110", "111"]),
        ("L6", ["", "0", "11", "110", "1001", "0011"], ["1", "10", "100", "101"]),
        ("L7", ["abb", "aabb", "babb"], ["", "ab", "abba", "bbb"]),
        ("L8", ["abab", "abbbaaaa"], ["", "a", "baaa", "aaa", "aaaaa"]),
        ("L9", ["100", "0111", "10100"], ["", "1", "11", "011", "0010", "11000"]),
        ("L10", ["", "ab", "aaa", "bbb", "abab"], ["a", "b", "aa", "aab"]),
    ],
)
def test_dfa_acceptance(lid: str, accepted: list[str], rejected: list[str]) -> None:
    dfa = LANGUAGES[lid].dfa
    for s in accepted:
        assert dfa.accepts(s), (lid, s)
    for s in rejected:
        assert not dfa.accepts(s), (lid, s)


def test_dfa_rejects_unknown_symbols() -> None:
    with pytest.raises(ValueError):
        LANGUAGES["L1"].dfa.accepts("012")


def test_partial_dfa_completion_adds_one_trap_state() -> None:
    partial = DFA("ab", [[1, None], [None, 0]], 0, [1])
    total = partial.complete()
    assert not partial.is_complete() and total.is_complete()
    assert total.num_states == partial.num_states + 1
    for s in strings_up_to("ab", 6):
        assert partial.accepts(s) == total.accepts(s)


def test_trace_and_serialisation_round_trip() -> None:
    dfa = LANGUAGES["L7"].dfa
    steps = dfa.trace("aabb")
    assert [st["symbol"] for st in steps] == list("aabb")
    assert steps[-1]["to"] in {dfa.names[q] for q in dfa.accepting}
    again = DFA.from_dict(dfa.to_dict())
    assert again.signature() == dfa.signature() and again.names == dfa.names


def test_count_table_matches_brute_force(rng) -> None:
    for _ in range(25):
        dfa = random_dfa(rng, partial=True)
        counts = dfa.accepted_counts(7)
        for n in range(8):
            brute = sum(dfa.accepts(s) for s in strings_up_to("ab", n) if len(s) == n)
            assert counts[n] == brute


# ----------------------------------------------------------------------------- NFA
def test_nfa_acceptance_and_trace_sets() -> None:
    nfa = LANGUAGES["L7"].nfa  # n0 -a-> {n0,n1}, n1 -b-> n2, n2 -b-> n3
    assert nfa.accepts("abb") and nfa.accepts("babb") and not nfa.accepts("ab")
    trace = nfa.trace("abb")
    assert trace["initial"] == ["n0"]
    assert [step["to"] for step in trace["steps"]] == [["n0", "n1"], ["n0", "n2"], ["n0", "n3"]]
    assert trace["accepted"] is True


def test_epsilon_closure() -> None:
    nfa = NFA.from_table("a", {"p": {"a": ["r"]}, "q": {}, "r": {}}, "p", ["r"], epsilon={"p": ["q"], "q": ["r"]})
    assert nfa.initial() == frozenset({0, 1, 2})
    assert nfa.accepts("")  # p -ε-> q -ε-> r


@pytest.mark.parametrize("lid", list(LANGUAGES))
def test_subset_construction_is_equivalent(lid: str) -> None:
    lang = LANGUAGES[lid]
    for nfa in (lang.nfa, lang.thompson_nfa):
        dfa, steps = subset_construction(nfa)
        assert dfa.is_complete()
        assert are_equivalent(dfa, lang.dfa)
        assert len(steps) == dfa.num_states * len(dfa.alphabet)
        for s in strings_up_to(lang.alphabet_str, 8):
            assert nfa.accepts(s) == dfa.accepts(s) == lang.dfa.accepts(s)


def test_subset_construction_exponential_blowup_l9() -> None:
    nfa = LANGUAGES["L9"].nfa
    dfa, _ = subset_construction(nfa)
    assert nfa.num_states == 4 and dfa.num_states == 8


def test_random_nfa_roundtrip_via_reverse(rng) -> None:
    """reverse(reverse(N)) accepts the same language as N."""
    for _ in range(30):
        dfa = random_dfa(rng, partial=True)
        nfa = NFA.from_dfa(dfa)
        back, _ = subset_construction(nfa.reverse().reverse())
        assert are_equivalent(back, dfa)
        rev, _ = subset_construction(nfa.reverse())
        for s in strings_up_to("ab", 6):
            assert rev.accepts(s) == dfa.accepts(s[::-1])


# ----------------------------------------------------------------------------- regex / Thompson
def test_thompson_dragon_book_example() -> None:
    nfa = thompson("(a|b)*abb", "ab")
    dfa, _ = subset_construction(nfa)
    assert nfa.num_states == 11 and nfa.has_epsilon
    assert dfa.num_states == 5  # Dragon Book: states A..E before minimization


@pytest.mark.parametrize("bad", ["(ab", "a)", "a|*", "c", "a**(b"])
def test_regex_syntax_errors(bad: str) -> None:
    with pytest.raises(RegexSyntaxError):
        thompson(bad, "ab")


def test_regex_operators() -> None:
    nfa = thompson("a+b?|ε", "ab")
    for s, expected in [("", True), ("a", True), ("aab", True), ("b", False), ("abb", False)]:
        assert nfa.accepts(s) is expected, s
