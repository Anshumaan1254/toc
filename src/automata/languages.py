"""The target regular languages L1-L10.

Every language carries four *independent* definitions that are cross-checked against each
other (see ``tests/test_languages.py`` and notebook 01):

1. ``dfa``       - hand-built ground-truth DFA (the only source of dataset labels);
2. ``nfa``       - a natural hand-built NFA where one exists, else Thompson's ε-NFA of ``regex``;
3. ``regex``     - a regular expression (also fed to Python's ``re`` as a further check);
4. ``predicate`` - a plain Python function written directly from the English definition.

``expected_min_states`` was derived by hand (total DFA, trap state counted) and is asserted
against Hopcroft's output, never computed from it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from typing import Callable

from .dfa import DFA
from .nfa import NFA
from .regex import thompson


@dataclass(frozen=True)
class Language:
    id: str
    name: str
    description: str
    alphabet: tuple[str, ...]
    regex: str
    family: str
    difficulty: str
    predicate: Callable[[str], bool] = field(repr=False, compare=False)
    dfa_table: dict[str, dict[str, str]] = field(repr=False, compare=False)
    dfa_start: str = field(repr=False, compare=False, default="q0")
    dfa_accepting: tuple[str, ...] = field(repr=False, compare=False, default=())
    state_notes: dict[str, str] = field(repr=False, compare=False, default_factory=dict)
    nfa_table: dict[str, dict[str, list[str]]] | None = field(repr=False, compare=False, default=None)
    nfa_start: str = field(repr=False, compare=False, default="n0")
    nfa_accepting: tuple[str, ...] = field(repr=False, compare=False, default=())
    expected_min_states: int = 0
    ml_note: str = ""

    @cached_property
    def dfa(self) -> DFA:
        return DFA.from_table(
            self.alphabet,
            self.dfa_table,
            self.dfa_start,
            self.dfa_accepting,
            meta={"language": self.id, "source": "hand-built ground truth", "state_notes": self.state_notes},
        )

    @cached_property
    def thompson_nfa(self) -> NFA:
        nfa = thompson(self.regex, self.alphabet)
        nfa.meta.update({"language": self.id})
        return nfa

    @cached_property
    def nfa(self) -> NFA:
        """The NFA shown for this language: a natural hand-built one, else Thompson's ε-NFA."""
        if self.nfa_table is None:
            return self.thompson_nfa
        return NFA.from_table(
            self.alphabet,
            self.nfa_table,
            self.nfa_start,
            self.nfa_accepting,
            meta={"language": self.id, "construction": "hand-built"},
        )

    @property
    def alphabet_str(self) -> str:
        return "".join(self.alphabet)

    def summary(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "alphabet": list(self.alphabet),
            "regex": self.regex,
            "family": self.family,
            "difficulty": self.difficulty,
            "expected_min_states": self.expected_min_states,
            "ml_note": self.ml_note,
        }


def _l9_table() -> dict[str, dict[str, str]]:
    """L9 DFA: remember the last three symbols (short strings are padded with 0s)."""
    states = [f"{i:03b}" for i in range(8)]
    return {s: {b: (s[1:] + b) for b in "01"} for s in states}


LANGUAGES: dict[str, Language] = {}


def _register(lang: Language) -> None:
    LANGUAGES[lang.id] = lang


_register(
    Language(
        id="L1",
        name="Even number of 0s",
        description="Binary strings containing an even number of 0s (the empty string has zero 0s).",
        alphabet=("0", "1"),
        regex="(1*01*0)*1*",
        family="parity / counting",
        difficulty="easy",
        predicate=lambda s: s.count("0") % 2 == 0,
        dfa_table={"q0": {"0": "q1", "1": "q0"}, "q1": {"0": "q0", "1": "q1"}},
        dfa_start="q0",
        dfa_accepting=("q0",),
        state_notes={"q0": "even number of 0s so far", "q1": "odd number of 0s so far"},
        expected_min_states=2,
        ml_note="Parity is a counting property; generic count-mod-k features make it learnable.",
    )
)

_register(
    Language(
        id="L2",
        name='Ends with "01"',
        description='Binary strings whose last two symbols are "01".',
        alphabet=("0", "1"),
        regex="(0|1)*01",
        family="suffix",
        difficulty="easy",
        predicate=lambda s: s.endswith("01"),
        dfa_table={
            "q0": {"0": "q1", "1": "q0"},
            "q1": {"0": "q1", "1": "q2"},
            "q2": {"0": "q1", "1": "q0"},
        },
        dfa_start="q0",
        dfa_accepting=("q2",),
        state_notes={"q0": "no progress towards 01", "q1": "last symbol is 0", "q2": "ends with 01"},
        nfa_table={"n0": {"0": ["n0", "n1"], "1": ["n0"]}, "n1": {"1": ["n2"]}, "n2": {}},
        nfa_start="n0",
        nfa_accepting=("n2",),
        expected_min_states=3,
        ml_note="A local suffix pattern; last-k / suffix features capture it directly.",
    )
)

_register(
    Language(
        id="L3",
        name='Contains "101"',
        description='Binary strings containing the substring "101" somewhere.',
        alphabet=("0", "1"),
        regex="(0|1)*101(0|1)*",
        family="substring",
        difficulty="easy",
        predicate=lambda s: "101" in s,
        dfa_table={
            "q0": {"0": "q0", "1": "q1"},
            "q1": {"0": "q2", "1": "q1"},
            "q2": {"0": "q0", "1": "q3"},
            "q3": {"0": "q3", "1": "q3"},
        },
        dfa_start="q0",
        dfa_accepting=("q3",),
        state_notes={"q0": "no progress", "q1": "seen 1", "q2": "seen 10", "q3": "found 101 (absorbing)"},
        nfa_table={
            "n0": {"0": ["n0"], "1": ["n0", "n1"]},
            "n1": {"0": ["n2"]},
            "n2": {"1": ["n3"]},
            "n3": {"0": ["n3"], "1": ["n3"]},
        },
        nfa_start="n0",
        nfa_accepting=("n3",),
        expected_min_states=4,
        ml_note="Substring presence equals a non-zero 3-gram count, which is a generic feature.",
    )
)

_register(
    Language(
        id="L4",
        name="Number of 1s divisible by 3",
        description="Binary strings whose count of 1s is a multiple of 3 (zero counts).",
        alphabet=("0", "1"),
        regex="0*(10*10*10*)*",
        family="modular counting",
        difficulty="medium",
        predicate=lambda s: s.count("1") % 3 == 0,
        dfa_table={
            "q0": {"0": "q0", "1": "q1"},
            "q1": {"0": "q1", "1": "q2"},
            "q2": {"0": "q2", "1": "q0"},
        },
        dfa_start="q0",
        dfa_accepting=("q0",),
        state_notes={"q0": "#1s ≡ 0 (mod 3)", "q1": "#1s ≡ 1 (mod 3)", "q2": "#1s ≡ 2 (mod 3)"},
        expected_min_states=3,
        ml_note="Modular counting: learnable only because count-mod-3 is among the generic features.",
    )
)

_register(
    Language(
        id="L5",
        name="No two consecutive 1s",
        description='Binary strings that never contain "11" (Fibonacci-many strings per length).',
        alphabet=("0", "1"),
        regex="(0|10)*1?",
        family="local constraint",
        difficulty="easy",
        predicate=lambda s: "11" not in s,
        dfa_table={
            "q0": {"0": "q0", "1": "q1"},
            "q1": {"0": "q0", "1": "trap"},
            "trap": {"0": "trap", "1": "trap"},
        },
        dfa_start="q0",
        dfa_accepting=("q0", "q1"),
        state_notes={"q0": "last symbol not 1", "q1": "last symbol is 1", "trap": "saw 11 (dead)"},
        expected_min_states=3,
        ml_note="Forbidden factor: the 2-gram count of 11 must be zero.",
    )
)

_register(
    Language(
        id="L6",
        name="Binary multiple of 3",
        description="Binary numbers (MSB first) whose value is divisible by 3. Leading zeros are allowed and the empty string denotes 0.",
        alphabet=("0", "1"),
        regex="(0|1(01*0)*1)*",
        family="modular arithmetic",
        difficulty="hard",
        predicate=lambda s: s == "" or int(s, 2) % 3 == 0,
        dfa_table={
            "r0": {"0": "r0", "1": "r1"},
            "r1": {"0": "r2", "1": "r0"},
            "r2": {"0": "r1", "1": "r2"},
        },
        dfa_start="r0",
        dfa_accepting=("r0",),
        state_notes={"r0": "value ≡ 0 (mod 3)", "r1": "value ≡ 1 (mod 3)", "r2": "value ≡ 2 (mod 3)"},
        expected_min_states=3,
        ml_note="Needs position-weighted sums mod 3; no generic feature encodes it, so ML is expected to struggle.",
    )
)

_register(
    Language(
        id="L7",
        name="(a|b)*abb",
        description='Strings over {a,b} ending in "abb" - the classic NFA example from the Dragon Book.',
        alphabet=("a", "b"),
        regex="(a|b)*abb",
        family="suffix",
        difficulty="easy",
        predicate=lambda s: s.endswith("abb"),
        dfa_table={
            "q0": {"a": "q1", "b": "q0"},
            "q1": {"a": "q1", "b": "q2"},
            "q2": {"a": "q1", "b": "q3"},
            "q3": {"a": "q1", "b": "q0"},
        },
        dfa_start="q0",
        dfa_accepting=("q3",),
        state_notes={"q0": "no progress", "q1": "suffix a", "q2": "suffix ab", "q3": "suffix abb"},
        nfa_table={"n0": {"a": ["n0", "n1"], "b": ["n0"]}, "n1": {"b": ["n2"]}, "n2": {"b": ["n3"]}, "n3": {}},
        nfa_start="n0",
        nfa_accepting=("n3",),
        expected_min_states=4,
        ml_note="Suffix pattern; easy for suffix / last-k features.",
    )
)

_register(
    Language(
        id="L8",
        name="Length ≡ 0 (mod 4) and starts with a",
        description="Strings over {a,b} that start with 'a' and whose length is a multiple of 4 (so the empty string is rejected).",
        alphabet=("a", "b"),
        regex="a(a|b)(a|b)(a|b)((a|b)(a|b)(a|b)(a|b))*",
        family="length modular + prefix",
        difficulty="medium",
        predicate=lambda s: len(s) % 4 == 0 and s.startswith("a"),
        dfa_table={
            "s": {"a": "r1", "b": "trap"},
            "r1": {"a": "r2", "b": "r2"},
            "r2": {"a": "r3", "b": "r3"},
            "r3": {"a": "r0", "b": "r0"},
            "r0": {"a": "r1", "b": "r1"},
            "trap": {"a": "trap", "b": "trap"},
        },
        dfa_start="s",
        dfa_accepting=("r0",),
        state_notes={
            "s": "nothing read yet",
            "r1": "starts with a, length ≡ 1",
            "r2": "starts with a, length ≡ 2",
            "r3": "starts with a, length ≡ 3",
            "r0": "starts with a, length ≡ 0",
            "trap": "started with b (dead)",
        },
        expected_min_states=6,
        ml_note="Length mod 4 is a generic feature, and the first symbol is a positional feature.",
    )
)

_register(
    Language(
        id="L9",
        name="Third symbol from the end is 1",
        description="Binary strings of length >= 3 whose third-to-last symbol is 1. Its 4-state NFA needs 2^3 = 8 DFA states (exponential blow-up).",
        alphabet=("0", "1"),
        regex="(0|1)*1(0|1)(0|1)",
        family="positional (from the end)",
        difficulty="medium",
        predicate=lambda s: len(s) >= 3 and s[-3] == "1",
        dfa_table=_l9_table(),
        dfa_start="000",
        dfa_accepting=("100", "101", "110", "111"),
        state_notes={f"{i:03b}": f"last three symbols {i:03b}" for i in range(8)},
        nfa_table={"n0": {"0": ["n0"], "1": ["n0", "n1"]}, "n1": {"0": ["n2"], "1": ["n2"]}, "n2": {"0": ["n3"], "1": ["n3"]}, "n3": {}},
        nfa_start="n0",
        nfa_accepting=("n3",),
        expected_min_states=8,
        ml_note="Positional features for the last 6 symbols expose it directly.",
    )
)

_register(
    Language(
        id="L10",
        name="#a − #b ≡ 0 (mod 3)",
        description="Strings over {a,b} where the number of a's minus the number of b's is a multiple of 3.",
        alphabet=("a", "b"),
        regex="(ba|(a|bb)(ab)*(b|aa))*",
        family="modular counting (interaction)",
        difficulty="hard",
        predicate=lambda s: (s.count("a") - s.count("b")) % 3 == 0,
        dfa_table={
            "d0": {"a": "d1", "b": "d2"},
            "d1": {"a": "d2", "b": "d0"},
            "d2": {"a": "d0", "b": "d1"},
        },
        dfa_start="d0",
        dfa_accepting=("d0",),
        state_notes={"d0": "#a − #b ≡ 0 (mod 3)", "d1": "#a − #b ≡ 1 (mod 3)", "d2": "#a − #b ≡ 2 (mod 3)"},
        expected_min_states=3,
        ml_note="Needs an interaction of two residues (#a mod 3, #b mod 3): no linear model over the one-hot residues can separate it.",
    )
)


def get_language(language_id: str) -> Language:
    try:
        return LANGUAGES[language_id]
    except KeyError:
        raise KeyError(f"unknown language {language_id!r}; choose one of {', '.join(LANGUAGES)}") from None
