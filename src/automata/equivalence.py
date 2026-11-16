"""Product construction and DFA equivalence checking.

Two DFAs over the same alphabet are equivalent iff no reachable state of their product
automaton disagrees on acceptance.  :func:`find_counterexample` runs BFS over the product,
so the witness it returns is a *shortest* string on which the two automata differ.
"""

from __future__ import annotations

from collections import deque
from typing import Callable

from .dfa import DFA

AcceptRule = Callable[[bool, bool], bool]

RULES: dict[str, AcceptRule] = {
    "intersection": lambda a, b: a and b,
    "union": lambda a, b: a or b,
    "difference": lambda a, b: a and not b,
    "symmetric_difference": lambda a, b: a != b,
}


def _check_alphabets(d1: DFA, d2: DFA) -> None:
    if d1.alphabet != d2.alphabet:
        raise ValueError(f"alphabets differ: {d1.alphabet!r} vs {d2.alphabet!r}")


def product(d1: DFA, d2: DFA, mode: str = "intersection") -> DFA:
    """Reachable part of the product automaton with the chosen acceptance rule."""
    _check_alphabets(d1, d2)
    rule = RULES[mode]
    a, b = d1.complete(), d2.complete()
    start = (a.start, b.start)
    index = {start: 0}
    pairs = [start]
    queue = deque([start])
    delta: list[list[int]] = []
    while queue:
        p, q = queue.popleft()
        row = []
        for c in range(len(a.alphabet)):
            nxt = (a.delta[p][c], b.delta[q][c])
            if nxt not in index:
                index[nxt] = len(pairs)
                pairs.append(nxt)  # type: ignore[arg-type]
                queue.append(nxt)  # type: ignore[arg-type]
            row.append(index[nxt])  # type: ignore[index]
        delta.append(row)
    accepting = [i for i, (p, q) in enumerate(pairs) if rule(p in a.accepting, q in b.accepting)]
    names = [f"({a.names[p]},{b.names[q]})" for p, q in pairs]
    return DFA(a.alphabet, delta, 0, accepting, names, meta={"construction": f"product:{mode}"})


def find_counterexample(d1: DFA, d2: DFA) -> str | None:
    """Shortest string accepted by exactly one of the two DFAs, or ``None`` if equivalent."""
    _check_alphabets(d1, d2)
    a, b = d1.complete(), d2.complete()
    start = (a.start, b.start)
    parent: dict[tuple[int, int], tuple[tuple[int, int], str] | None] = {start: None}
    queue = deque([start])
    while queue:
        pair = queue.popleft()
        p, q = pair
        if (p in a.accepting) != (q in b.accepting):
            symbols = []
            node = pair
            while parent[node] is not None:
                prev, sym = parent[node]  # type: ignore[misc]
                symbols.append(sym)
                node = prev
            return "".join(reversed(symbols))
        for c, sym in enumerate(a.alphabet):
            nxt = (a.delta[p][c], b.delta[q][c])
            if nxt not in parent:
                parent[nxt] = (pair, sym)  # type: ignore[index]
                queue.append(nxt)  # type: ignore[arg-type]
    return None


def are_equivalent(d1: DFA, d2: DFA) -> bool:
    return find_counterexample(d1, d2) is None


def agreement_rate(d1: DFA, d2: DFA, strings: list[str]) -> float:
    """Fraction of ``strings`` on which both DFAs give the same verdict."""
    if not strings:
        return float("nan")
    return sum(d1.accepts(s) == d2.accepts(s) for s in strings) / len(strings)
