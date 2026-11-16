"""Deterministic finite automata.

Conventions used across the whole project
-----------------------------------------
* States are the integers ``0..n-1``; ``names[i]`` is the display label of state ``i``.
* The alphabet is a tuple of distinct single-character symbols.  Its order fixes
  the canonical state numbering and the JSON export.
* ``delta[q][k]`` is the successor of state ``q`` on ``alphabet[k]``.  ``None``
  marks a missing transition, i.e. a *partial* DFA (passive learners produce these).
* Every algorithm that needs a total DFA calls :meth:`DFA.complete` first, which adds
  an explicit non-accepting trap state.  **All state counts reported in this project
  are for total DFAs, with the trap state counted.**
"""

from __future__ import annotations

from collections import deque
from typing import Any, Iterable, Mapping, Sequence

TRAP_NAME = "trap"


class DFA:
    """A (possibly partial) deterministic finite automaton over a finite alphabet."""

    __slots__ = ("alphabet", "delta", "start", "accepting", "names", "meta", "_index")

    def __init__(
        self,
        alphabet: Sequence[str],
        delta: Sequence[Sequence[int | None]],
        start: int,
        accepting: Iterable[int],
        names: Sequence[str] | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> None:
        alphabet = tuple(alphabet)
        if not alphabet:
            raise ValueError("alphabet must be non-empty")
        if any(not isinstance(a, str) or len(a) != 1 for a in alphabet):
            raise ValueError(f"alphabet symbols must be single characters, got {alphabet!r}")
        if len(set(alphabet)) != len(alphabet):
            raise ValueError(f"alphabet symbols must be distinct, got {alphabet!r}")
        n = len(delta)
        if n == 0:
            raise ValueError("a DFA needs at least one state")
        rows: list[list[int | None]] = []
        for q, row in enumerate(delta):
            row = list(row)
            if len(row) != len(alphabet):
                raise ValueError(f"state {q}: expected {len(alphabet)} transitions, got {len(row)}")
            for t in row:
                if t is not None and not (0 <= int(t) < n):
                    raise ValueError(f"state {q}: transition target {t} out of range")
            rows.append([None if t is None else int(t) for t in row])
        if not (0 <= int(start) < n):
            raise ValueError(f"start state {start} out of range")
        acc = frozenset(int(q) for q in accepting)
        if any(not (0 <= q < n) for q in acc):
            raise ValueError("accepting state out of range")
        if names is None:
            names = [f"q{i}" for i in range(n)]
        names = [str(x) for x in names]
        if len(names) != n or len(set(names)) != n:
            raise ValueError("names must be unique and match the number of states")

        self.alphabet: tuple[str, ...] = alphabet
        self.delta: list[list[int | None]] = rows
        self.start: int = int(start)
        self.accepting: frozenset[int] = acc
        self.names: list[str] = names
        self.meta: dict[str, Any] = dict(meta or {})
        self._index: dict[str, int] = {a: i for i, a in enumerate(alphabet)}

    # ------------------------------------------------------------------ builders
    @classmethod
    def from_table(
        cls,
        alphabet: Sequence[str],
        table: Mapping[str, Mapping[str, str]],
        start: str,
        accepting: Iterable[str],
        meta: Mapping[str, Any] | None = None,
    ) -> "DFA":
        """Build a DFA from ``{state: {symbol: next_state}}`` using named states."""
        names = list(table.keys())
        idx = {name: i for i, name in enumerate(names)}
        delta: list[list[int | None]] = []
        for name in names:
            row: list[int | None] = []
            for a in alphabet:
                target = table[name].get(a)
                if target is not None and target not in idx:
                    raise ValueError(f"unknown target state {target!r} in table")
                row.append(None if target is None else idx[target])
            delta.append(row)
        return cls(alphabet, delta, idx[start], [idx[a] for a in accepting], names, meta)

    # ------------------------------------------------------------------ basics
    @property
    def num_states(self) -> int:
        return len(self.delta)

    @property
    def num_transitions(self) -> int:
        return sum(1 for row in self.delta for t in row if t is not None)

    def symbol_index(self, symbol: str) -> int:
        try:
            return self._index[symbol]
        except KeyError:
            raise ValueError(f"symbol {symbol!r} is not in the alphabet {''.join(self.alphabet)!r}") from None

    def step(self, q: int | None, symbol: str) -> int | None:
        if q is None:
            return None
        return self.delta[q][self.symbol_index(symbol)]

    def run(self, s: str, q: int | None = None) -> int | None:
        """Final state after reading ``s`` (``None`` if a missing transition is hit)."""
        state: int | None = self.start if q is None else q
        index = self._index
        delta = self.delta
        for ch in s:
            if state is None:
                break
            try:
                state = delta[state][index[ch]]
            except KeyError:
                raise ValueError(f"symbol {ch!r} is not in the alphabet {''.join(self.alphabet)!r}") from None
        return state

    def accepts(self, s: str) -> bool:
        q = self.run(s)
        return q is not None and q in self.accepting

    def trace(self, s: str) -> list[dict[str, Any]]:
        """Step-by-step run: one record per consumed symbol (``to`` is ``None`` on a missing edge)."""
        steps: list[dict[str, Any]] = []
        q: int | None = self.start
        for i, ch in enumerate(s):
            nxt = self.step(q, ch) if q is not None else None
            steps.append(
                {
                    "index": i,
                    "symbol": ch,
                    "from": None if q is None else self.names[q],
                    "to": None if nxt is None else self.names[nxt],
                }
            )
            q = nxt
        return steps

    def is_complete(self) -> bool:
        return all(t is not None for row in self.delta for t in row)

    # ------------------------------------------------------------------ transformations
    def complete(self, trap_name: str = TRAP_NAME) -> "DFA":
        """Return a total DFA; missing transitions go to a fresh non-accepting trap state."""
        if self.is_complete():
            return self
        n = self.num_states
        name = trap_name
        while name in self.names:
            name += "'"
        delta = [[n if t is None else t for t in row] for row in self.delta]
        delta.append([n] * len(self.alphabet))
        meta = dict(self.meta)
        meta["completed_with_trap"] = True
        return DFA(self.alphabet, delta, self.start, self.accepting, [*self.names, name], meta)

    def reachable_states(self) -> list[int]:
        """States reachable from the start, in breadth-first order (alphabet order on ties)."""
        seen = {self.start}
        order = [self.start]
        queue = deque([self.start])
        while queue:
            q = queue.popleft()
            for t in self.delta[q]:
                if t is not None and t not in seen:
                    seen.add(t)
                    order.append(t)
                    queue.append(t)
        return order

    def trim(self) -> "DFA":
        """Drop unreachable states and renumber the rest in canonical BFS order."""
        order = self.reachable_states()
        remap = {old: new for new, old in enumerate(order)}
        delta = [[None if t is None else remap[t] for t in self.delta[old]] for old in order]
        accepting = [remap[q] for q in self.accepting if q in remap]
        names = [self.names[old] for old in order]
        return DFA(self.alphabet, delta, 0, accepting, names, self.meta)

    def complement(self) -> "DFA":
        total = self.complete()
        accepting = [q for q in range(total.num_states) if q not in total.accepting]
        return DFA(total.alphabet, total.delta, total.start, accepting, total.names, total.meta)

    def rename(self, names: Sequence[str]) -> "DFA":
        return DFA(self.alphabet, self.delta, self.start, self.accepting, names, self.meta)

    def with_meta(self, **meta: Any) -> "DFA":
        merged = dict(self.meta)
        merged.update(meta)
        return DFA(self.alphabet, self.delta, self.start, self.accepting, self.names, merged)

    def signature(self) -> tuple[Any, ...]:
        """Isomorphism-invariant fingerprint of the reachable part (names ignored).

        Two DFAs have equal signatures iff their reachable parts are isomorphic, so
        two *minimal* DFAs have equal signatures iff they accept the same language.
        """
        t = self.trim()
        return (t.alphabet, tuple(tuple(row) for row in t.delta), tuple(sorted(t.accepting)))

    # ------------------------------------------------------------------ counting / sampling support
    def count_table(self, max_len: int) -> list[list[int]]:
        """``table[r][q]`` = number of strings of length ``r`` accepted when starting in ``q``.

        Exact Python integers, used for uniform sampling of accepted strings.
        """
        total = self.complete()
        n, k = total.num_states, len(total.alphabet)
        table = [[1 if q in total.accepting else 0 for q in range(n)]]
        for _ in range(max_len):
            prev = table[-1]
            table.append([sum(prev[total.delta[q][c]] for c in range(k)) for q in range(n)])  # type: ignore[index]
        return table

    def accepted_counts(self, max_len: int) -> list[int]:
        """Number of accepted strings of every length ``0..max_len``."""
        table = self.complete().count_table(max_len)
        start = self.start
        return [row[start] for row in table]

    # ------------------------------------------------------------------ serialisation
    def to_dict(self) -> dict[str, Any]:
        transitions = {
            self.names[q]: {
                a: self.names[t] for a, t in zip(self.alphabet, self.delta[q]) if t is not None
            }
            for q in range(self.num_states)
        }
        return {
            "kind": "dfa",
            "alphabet": list(self.alphabet),
            "states": list(self.names),
            "start": self.names[self.start],
            "accepting": [self.names[q] for q in sorted(self.accepting)],
            "transitions": transitions,
            "num_states": self.num_states,
            "num_transitions": self.num_transitions,
            "complete": self.is_complete(),
            "meta": self.meta,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "DFA":
        if data.get("kind", "dfa") != "dfa":
            raise ValueError(f"expected a DFA payload, got kind={data.get('kind')!r}")
        names = list(data["states"])
        table = {name: dict(data["transitions"].get(name, {})) for name in names}
        return cls.from_table(data["alphabet"], table, data["start"], data["accepting"], data.get("meta"))

    def __repr__(self) -> str:
        return (
            f"DFA(states={self.num_states}, alphabet={''.join(self.alphabet)!r}, "
            f"accepting={len(self.accepting)}, complete={self.is_complete()})"
        )
