"""Nondeterministic finite automata with ε-transitions, and the subset construction.

An :class:`NFA` may have several start states (needed for reversal in Brzozowski's
algorithm) and ε-moves.  :func:`subset_construction` turns it into an equivalent
*total* DFA (the empty subset ∅ becomes an explicit trap state) and can record every
step ``(T, a) -> move(T, a) -> ε-closure`` so the website can replay the construction.
"""

from __future__ import annotations

from collections import deque
from typing import Any, Iterable, Mapping, Sequence

from .dfa import DFA

EPSILON = "ε"


def _letters(i: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA ... (spreadsheet-style labels for subset states)."""
    out = ""
    i += 1
    while i:
        i, rem = divmod(i - 1, 26)
        out = chr(65 + rem) + out
    return out


class NFA:
    """An ε-NFA.  States are ``0..n-1``; ``names`` holds their display labels."""

    __slots__ = ("alphabet", "names", "start", "accepting", "delta", "eps", "meta", "_index")

    def __init__(
        self,
        alphabet: Sequence[str],
        names: Sequence[str],
        start: Iterable[int],
        accepting: Iterable[int],
        transitions: Mapping[tuple[int, str], Iterable[int]],
        epsilon: Mapping[int, Iterable[int]] | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> None:
        alphabet = tuple(alphabet)
        if not alphabet or any(len(a) != 1 for a in alphabet) or len(set(alphabet)) != len(alphabet):
            raise ValueError(f"invalid alphabet {alphabet!r}")
        if EPSILON in alphabet:
            raise ValueError("ε cannot be an alphabet symbol")
        names = [str(x) for x in names]
        n = len(names)
        if n == 0 or len(set(names)) != n:
            raise ValueError("NFA state names must be unique and non-empty")
        self.alphabet: tuple[str, ...] = alphabet
        self.names: list[str] = names
        # An empty start set is allowed: it denotes the empty language (needed so that
        # reversing an automaton with no accepting states stays exact in Brzozowski's algorithm).
        self.start: frozenset[int] = frozenset(int(q) for q in start)
        self.accepting: frozenset[int] = frozenset(int(q) for q in accepting)
        self._index = {a: i for i, a in enumerate(alphabet)}
        self.delta: list[dict[str, frozenset[int]]] = [dict() for _ in range(n)]
        for (q, a), targets in transitions.items():
            if a not in self._index:
                raise ValueError(f"symbol {a!r} not in alphabet")
            tset = frozenset(int(t) for t in targets)
            if tset:
                self.delta[int(q)][a] = self.delta[int(q)].get(a, frozenset()) | tset
        self.eps: list[frozenset[int]] = [frozenset() for _ in range(n)]
        for q, targets in (epsilon or {}).items():
            self.eps[int(q)] = self.eps[int(q)] | frozenset(int(t) for t in targets)
        for q in range(n):
            for targets in [*self.delta[q].values(), self.eps[q]]:
                if any(not (0 <= t < n) for t in targets):
                    raise ValueError(f"state {q}: transition target out of range")
        if any(not (0 <= q < n) for q in self.start | self.accepting):
            raise ValueError("start/accepting state out of range")
        self.meta: dict[str, Any] = dict(meta or {})

    # ------------------------------------------------------------------ builders
    @classmethod
    def from_table(
        cls,
        alphabet: Sequence[str],
        table: Mapping[str, Mapping[str, Iterable[str]]],
        start: str | Iterable[str],
        accepting: Iterable[str],
        epsilon: Mapping[str, Iterable[str]] | None = None,
        states: Sequence[str] | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> "NFA":
        """Build from ``{state: {symbol: [targets]}}`` and ``{state: [ε-targets]}`` with named states."""
        names = list(states) if states is not None else list(table.keys())
        for extra in [*(epsilon or {}).keys()]:
            if extra not in names:
                names.append(extra)
        idx = {name: i for i, name in enumerate(names)}
        transitions: dict[tuple[int, str], list[int]] = {}
        for name, row in table.items():
            for a, targets in row.items():
                transitions[(idx[name], a)] = [idx[t] for t in targets]
        eps = {idx[name]: [idx[t] for t in targets] for name, targets in (epsilon or {}).items()}
        starts = [start] if isinstance(start, str) else list(start)
        return cls(alphabet, names, [idx[s] for s in starts], [idx[a] for a in accepting], transitions, eps, meta)

    @classmethod
    def from_dfa(cls, dfa: DFA) -> "NFA":
        transitions = {
            (q, a): [t]
            for q in range(dfa.num_states)
            for a, t in zip(dfa.alphabet, dfa.delta[q])
            if t is not None
        }
        return cls(dfa.alphabet, dfa.names, [dfa.start], dfa.accepting, transitions, None, dfa.meta)

    # ------------------------------------------------------------------ basics
    @property
    def num_states(self) -> int:
        return len(self.names)

    @property
    def num_transitions(self) -> int:
        return sum(len(t) for row in self.delta for t in row.values()) + sum(len(e) for e in self.eps)

    @property
    def has_epsilon(self) -> bool:
        return any(self.eps)

    def epsilon_closure(self, states: Iterable[int]) -> frozenset[int]:
        closure = set(states)
        stack = list(closure)
        while stack:
            q = stack.pop()
            for t in self.eps[q]:
                if t not in closure:
                    closure.add(t)
                    stack.append(t)
        return frozenset(closure)

    def move(self, states: Iterable[int], symbol: str) -> frozenset[int]:
        if symbol not in self._index:
            raise ValueError(f"symbol {symbol!r} is not in the alphabet {''.join(self.alphabet)!r}")
        out: set[int] = set()
        for q in states:
            out |= self.delta[q].get(symbol, frozenset())
        return frozenset(out)

    def initial(self) -> frozenset[int]:
        return self.epsilon_closure(self.start)

    def step(self, states: Iterable[int], symbol: str) -> frozenset[int]:
        return self.epsilon_closure(self.move(states, symbol))

    def accepts(self, s: str) -> bool:
        current = self.initial()
        for ch in s:
            current = self.step(current, ch)
            if not current:
                return False
        return bool(current & self.accepting)

    def trace(self, s: str) -> dict[str, Any]:
        """Active-state sets per symbol (after ε-closure), for the step-by-step animation."""
        current = self.initial()
        steps = []
        for i, ch in enumerate(s):
            moved = self.move(current, ch)
            nxt = self.epsilon_closure(moved)
            steps.append(
                {
                    "index": i,
                    "symbol": ch,
                    "from": self._sorted_names(current),
                    "move": self._sorted_names(moved),
                    "to": self._sorted_names(nxt),
                }
            )
            current = nxt
        return {
            "initial": self._sorted_names(self.initial()),
            "steps": steps,
            "final": self._sorted_names(current),
            "accepted": bool(current & self.accepting),
        }

    def _sorted_names(self, states: Iterable[int]) -> list[str]:
        return [self.names[q] for q in sorted(states)]

    def reverse(self) -> "NFA":
        """NFA for the reversed language (start <-> accepting, every edge flipped)."""
        transitions: dict[tuple[int, str], set[int]] = {}
        for q in range(self.num_states):
            for a, targets in self.delta[q].items():
                for t in targets:
                    transitions.setdefault((t, a), set()).add(q)
        eps: dict[int, set[int]] = {}
        for q in range(self.num_states):
            for t in self.eps[q]:
                eps.setdefault(t, set()).add(q)
        return NFA(self.alphabet, self.names, self.accepting, self.start, transitions, eps, self.meta)

    # ------------------------------------------------------------------ serialisation
    def to_dict(self) -> dict[str, Any]:
        transitions = {
            self.names[q]: {a: self._sorted_names(self.delta[q][a]) for a in self.alphabet if a in self.delta[q]}
            for q in range(self.num_states)
        }
        epsilon = {self.names[q]: self._sorted_names(self.eps[q]) for q in range(self.num_states) if self.eps[q]}
        return {
            "kind": "nfa",
            "alphabet": list(self.alphabet),
            "states": list(self.names),
            "start": self._sorted_names(self.start),
            "accepting": self._sorted_names(self.accepting),
            "transitions": transitions,
            "epsilon": epsilon,
            "num_states": self.num_states,
            "num_transitions": self.num_transitions,
            "has_epsilon": self.has_epsilon,
            "meta": self.meta,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "NFA":
        if data.get("kind") != "nfa":
            raise ValueError(f"expected an NFA payload, got kind={data.get('kind')!r}")
        return cls.from_table(
            data["alphabet"],
            {name: row for name, row in data["transitions"].items()},
            data["start"],
            data["accepting"],
            data.get("epsilon") or {},
            states=data["states"],
            meta=data.get("meta"),
        )

    def __repr__(self) -> str:
        return (
            f"NFA(states={self.num_states}, alphabet={''.join(self.alphabet)!r}, "
            f"epsilon={self.has_epsilon}, start={len(self.start)}, accepting={len(self.accepting)})"
        )


def subset_construction(nfa: NFA, naming: str = "letters") -> tuple[DFA, list[dict[str, Any]]]:
    """Powerset construction NFA -> total DFA, plus a replayable list of steps.

    Each DFA state is an ε-closed set of NFA states; the empty set (if reachable) is kept
    as an explicit trap state named ``∅``.  States are created in BFS order, so the DFA
    returned is already in canonical numbering.  ``naming`` is ``"letters"`` (A, B, C, ...)
    or ``"sets"`` (``{0,1,2}``).
    """
    start = nfa.initial()
    subsets: list[frozenset[int]] = [start]
    index: dict[frozenset[int], int] = {start: 0}
    queue = deque([start])
    rows: list[list[int]] = []
    raw_steps: list[tuple[int, str, frozenset[int], frozenset[int], int, bool]] = []
    while queue:
        current = queue.popleft()
        i = index[current]
        row: list[int] = []
        for a in nfa.alphabet:
            moved = nfa.move(current, a)
            closure = nfa.epsilon_closure(moved)
            is_new = closure not in index
            if is_new:
                index[closure] = len(subsets)
                subsets.append(closure)
                queue.append(closure)
            row.append(index[closure])
            raw_steps.append((i, a, moved, closure, index[closure], is_new))
        rows.append(row)

    def label(k: int) -> str:
        if not subsets[k]:
            return "∅"
        if naming == "sets":
            return "{" + ",".join(nfa.names[q] for q in sorted(subsets[k])) + "}"
        return _letters(k)

    names = [label(k) for k in range(len(subsets))]
    accepting = [k for k, sub in enumerate(subsets) if sub & nfa.accepting]
    subset_members = {names[k]: [nfa.names[q] for q in sorted(sub)] for k, sub in enumerate(subsets)}
    dfa = DFA(
        nfa.alphabet,
        rows,
        0,
        accepting,
        names,
        meta={"construction": "subset", "subsets": subset_members, "nfa_states": nfa.num_states},
    )
    steps = [
        {
            "from": names[i],
            "from_set": subset_members[names[i]],
            "symbol": a,
            "move": [nfa.names[q] for q in sorted(moved)],
            "closure": [nfa.names[q] for q in sorted(closure)],
            "to": names[j],
            "new": is_new,
        }
        for (i, a, moved, closure, j, is_new) in raw_steps
    ]
    return dfa, steps
