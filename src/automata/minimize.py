"""DFA state minimization, implemented from scratch.

* :func:`hopcroft_minimize` - Hopcroft's O(n k log n) partition refinement (the primary method).
* :func:`moore_minimize`    - Moore's round-based refinement; records every round's partition
  (round ``k`` = the ``k``-equivalence classes), which drives the website's merge animation.
* :func:`brzozowski_minimize` - determinize(reverse(determinize(reverse(D)))), used only as an
  independent cross-check in the tests.
* :func:`distinguishing_suffixes` - the Myhill-Nerode table: for every pair of states the
  shortest suffix that separates them (pairs with no entry are equivalent and get merged).

All minimizers return a **total** DFA (trap state kept and counted) restricted to reachable
states, numbered canonically in BFS order, so minimal DFAs of the same language are
identical up to state names (compare with :meth:`DFA.signature`).
"""

from __future__ import annotations

from collections import deque
from typing import Any

from .dfa import DFA
from .nfa import NFA, subset_construction


def _prepare(dfa: DFA) -> DFA:
    """Total + reachable-only copy (the precondition of every minimizer)."""
    return dfa.complete().trim()


def _quotient(d: DFA, block_of: list[int], method: str, extra_meta: dict[str, Any] | None = None) -> DFA:
    """Build the quotient DFA of ``d`` (total, trimmed) by the partition ``block_of``."""
    blocks: dict[int, list[int]] = {}
    for q, b in enumerate(block_of):
        blocks.setdefault(b, []).append(q)
    # Canonical renumbering: BFS from the start block in alphabet order.
    order: list[int] = []
    seen: set[int] = set()
    queue = deque([block_of[d.start]])
    seen.add(block_of[d.start])
    while queue:
        b = queue.popleft()
        order.append(b)
        rep = blocks[b][0]
        for t in d.delta[rep]:
            tb = block_of[t]  # type: ignore[index]
            if tb not in seen:
                seen.add(tb)
                queue.append(tb)
    new_id = {b: i for i, b in enumerate(order)}
    delta = [[new_id[block_of[t]] for t in d.delta[blocks[b][0]]] for b in order]  # type: ignore[index]
    accepting = [new_id[b] for b in order if blocks[b][0] in d.accepting]
    names = []
    groups: dict[str, list[str]] = {}
    for b in order:
        members = sorted(blocks[b])
        member_names = [d.names[q] for q in members]
        name = member_names[0] if len(members) == 1 else "{" + ",".join(member_names) + "}"
        names.append(name)
        groups[name] = member_names
    meta = {
        "minimized_by": method,
        "states_before": d.num_states,
        "states_after": len(order),
        "groups": groups,
        "state_map": {d.names[q]: names[new_id[block_of[q]]] for q in range(d.num_states)},
    }
    if extra_meta:
        meta.update(extra_meta)
    return DFA(d.alphabet, delta, 0, accepting, names, meta)


def hopcroft_minimize(dfa: DFA) -> DFA:
    """Minimize with Hopcroft's algorithm (worklist of splitter blocks, smaller-half rule)."""
    d = _prepare(dfa)
    n, k = d.num_states, len(d.alphabet)
    inverse: list[list[list[int]]] = [[[] for _ in range(n)] for _ in range(k)]
    for q in range(n):
        for c in range(k):
            inverse[c][d.delta[q][c]].append(q)  # type: ignore[index]

    accepting = set(d.accepting)
    rejecting = set(range(n)) - accepting
    partition: list[set[int]] = [b for b in (accepting, rejecting) if b]
    block_of = [0] * n
    for bi, block in enumerate(partition):
        for q in block:
            block_of[q] = bi
    if len(partition) == 1:
        worklist = {0}
    else:
        worklist = {0 if len(partition[0]) <= len(partition[1]) else 1}

    while worklist:
        splitter = set(partition[worklist.pop()])
        for c in range(k):
            preimage: set[int] = set()
            for q in splitter:
                preimage.update(inverse[c][q])
            touched: dict[int, set[int]] = {}
            for q in preimage:
                touched.setdefault(block_of[q], set()).add(q)
            for b, inside in touched.items():
                block = partition[b]
                if len(inside) == len(block):
                    continue
                outside = block - inside
                partition[b] = inside
                new_b = len(partition)
                partition.append(outside)
                for q in outside:
                    block_of[q] = new_b
                if b in worklist:
                    worklist.add(new_b)
                else:
                    worklist.add(b if len(inside) <= len(outside) else new_b)
    return _quotient(d, block_of, "hopcroft")


def moore_rounds(dfa: DFA) -> tuple[DFA, list[list[list[str]]]]:
    """Moore refinement on the total, trimmed DFA; returns it with the partition after each round.

    Round 0 separates accepting from non-accepting states; round ``r`` groups states that no
    string of length <= ``r`` can distinguish.  Blocks are listed as state-name lists.
    """
    d = _prepare(dfa)
    n, k = d.num_states, len(d.alphabet)
    part = [1 if q in d.accepting else 0 for q in range(n)]

    def as_blocks(p: list[int]) -> list[list[str]]:
        blocks: dict[int, list[str]] = {}  # insertion order = order of first appearance
        for q, b in enumerate(p):
            blocks.setdefault(b, []).append(d.names[q])
        return list(blocks.values())

    rounds = [as_blocks(part)]
    while True:
        ids: dict[tuple[int, ...], int] = {}
        new_part = []
        for q in range(n):
            sig = (part[q], *(part[d.delta[q][c]] for c in range(k)))  # type: ignore[index]
            new_part.append(ids.setdefault(sig, len(ids)))
        if len(ids) == len(set(part)):
            break
        part = new_part
        rounds.append(as_blocks(part))
    return d, rounds


def moore_minimize(dfa: DFA) -> DFA:
    d, rounds = moore_rounds(dfa)
    name_to_q = {name: q for q, name in enumerate(d.names)}
    block_of = [0] * d.num_states
    for bi, block in enumerate(rounds[-1]):
        for name in block:
            block_of[name_to_q[name]] = bi
    return _quotient(d, block_of, "moore", {"moore_rounds": rounds})


def brzozowski_minimize(dfa: DFA) -> DFA:
    """det(rev(det(rev(D)))) - yields the minimal total DFA (used as an independent check)."""
    once, _ = subset_construction(NFA.from_dfa(_prepare(dfa)).reverse())
    twice, _ = subset_construction(NFA.from_dfa(once).reverse())
    return twice.trim().with_meta(minimized_by="brzozowski")


def minimize(dfa: DFA, method: str = "hopcroft") -> DFA:
    if method == "hopcroft":
        return hopcroft_minimize(dfa)
    if method == "moore":
        return moore_minimize(dfa)
    if method == "brzozowski":
        return brzozowski_minimize(dfa)
    raise ValueError(f"unknown minimization method {method!r}")


def distinguishing_suffixes(dfa: DFA) -> dict[tuple[str, str], str]:
    """Myhill-Nerode / table-filling: shortest separating suffix for every distinguishable pair.

    Works on the total, trimmed DFA.  Pairs absent from the result are equivalent states;
    in a minimal DFA every pair is present, which certifies minimality.  BFS over the
    reversed pair graph guarantees each suffix is a shortest one.
    """
    d = _prepare(dfa)
    n, k = d.num_states, len(d.alphabet)
    inverse: list[list[list[int]]] = [[[] for _ in range(n)] for _ in range(k)]
    for q in range(n):
        for c in range(k):
            inverse[c][d.delta[q][c]].append(q)  # type: ignore[index]
    suffix: dict[tuple[int, int], str] = {}
    queue: deque[tuple[int, int]] = deque()
    for p in range(n):
        for q in range(p + 1, n):
            if (p in d.accepting) != (q in d.accepting):
                suffix[(p, q)] = ""
                queue.append((p, q))
    while queue:
        p2, q2 = queue.popleft()
        w = suffix[(p2, q2)]
        for c in range(k):
            for p in inverse[c][p2]:
                for q in inverse[c][q2]:
                    if p == q:
                        continue
                    pair = (p, q) if p < q else (q, p)
                    if pair not in suffix:
                        suffix[pair] = d.alphabet[c] + w
                        queue.append(pair)
    return {(d.names[p], d.names[q]): w for (p, q), w in sorted(suffix.items())}


def is_minimal(dfa: DFA) -> bool:
    d = _prepare(dfa)
    return len(distinguishing_suffixes(d)) == d.num_states * (d.num_states - 1) // 2
