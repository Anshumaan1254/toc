"""Automata learning: Angluin's L* (active) and RPNI / EDSM state merging (passive).

L* (Angluin, 1987)
------------------
Learns the minimal DFA of an unknown regular language from a *membership oracle*
("is w in L?") and an *equivalence oracle* ("is hypothesis H correct? if not, give a
counterexample").  It maintains an observation table (S, E, T): S is a prefix-closed set of
access strings, E a suffix-closed set of experiments, and ``T(u) = member(u)`` for every
``u in (S ∪ S·Σ)·E``.  The table must be

* **closed**     - every row of S·Σ equals some row of S (else move that string into S);
* **consistent** - equal rows in S stay equal after appending any symbol (else add the
  separating experiment ``a·e`` to E);

after which the hypothesis DFA is read off the rows.  Counterexamples are processed with
Angluin's original rule (all prefixes go into S) or, optionally, Maler-Pnueli's (all
suffixes go into E).

When the "teacher" is a trained ML model, its language need not be regular, so the
learner runs under hard budgets (states, unique queries, wall-clock, rounds) and reports
``converged`` plus the ``stop_reason``.  The equivalence query is then approximated by
testing (:class:`SamplingEquivalenceOracle`).

RPNI / EDSM (passive)
---------------------
Both start from the prefix-tree acceptor (PTA) of the labelled sample and merge states in
the red-blue (blue-fringe) framework.  RPNI merges the shortlex-first blue state into the
first red state that keeps the automaton consistent with every labelled string; EDSM
scores every red-blue merge by the evidence it brings (number of agreeing labelled state
pairs) and performs the best one.  Merges are done on a union-find structure with an
undo log, so a rejected merge is rolled back instead of deep-copying the automaton.
"""

from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Protocol, Sequence

import numpy as np

from .dfa import DFA
from .equivalence import find_counterexample
from .minimize import hopcroft_minimize

MembershipFn = Callable[[Sequence[str]], Sequence[bool]]


# =============================================================================
# Oracles
# =============================================================================
class MembershipOracle:
    """Caching, batching wrapper around a membership function (e.g. a classifier)."""

    def __init__(self, fn: MembershipFn, batch_size: int = 8192) -> None:
        self.fn = fn
        self.batch_size = batch_size
        self.cache: dict[str, bool] = {}
        self.unique_queries = 0
        self.batches = 0

    @classmethod
    def from_dfa(cls, dfa: DFA) -> "MembershipOracle":
        return cls(lambda strings: [dfa.accepts(s) for s in strings])

    def query(self, strings: Sequence[str]) -> list[bool]:
        missing = [s for s in dict.fromkeys(strings) if s not in self.cache]
        for i in range(0, len(missing), self.batch_size):
            chunk = missing[i : i + self.batch_size]
            answers = self.fn(chunk)
            self.batches += 1
            for s, y in zip(chunk, answers):
                self.cache[s] = bool(y)
        self.unique_queries += len(missing)
        return [self.cache[s] for s in strings]

    def __call__(self, s: str) -> bool:
        return self.query([s])[0]


class EquivalenceOracle(Protocol):
    calls: int

    def find_counterexample(self, hypothesis: DFA) -> str | None: ...


class ExactEquivalenceOracle:
    """Perfect teacher: product-construction equivalence against a known target DFA."""

    def __init__(self, target: DFA) -> None:
        self.target = target
        self.calls = 0

    def find_counterexample(self, hypothesis: DFA) -> str | None:
        self.calls += 1
        return find_counterexample(hypothesis, self.target)


class SamplingEquivalenceOracle:
    """Approximate equivalence query by testing the hypothesis against the membership oracle.

    Test suite per call: every string up to ``exhaustive_max_len`` (shortlex), the optional
    ``extra`` strings (e.g. the training strings - no labels are used, only the oracle's
    answers), and ``random_samples`` fresh uniform-random strings with lengths uniform in
    ``[0, random_max_len]`` (a new batch each call).  The *shortest* disagreeing string is
    returned, which keeps the observation table small.
    """

    def __init__(
        self,
        membership: MembershipOracle,
        alphabet: Sequence[str],
        exhaustive_max_len: int = 10,
        random_samples: int = 2000,
        random_max_len: int = 40,
        extra: Iterable[str] = (),
        seed: int = 42,
    ) -> None:
        self.membership = membership
        self.alphabet = tuple(alphabet)
        self.random_samples = random_samples
        self.random_max_len = random_max_len
        self.seed = seed
        base = ["".join(t) for n in range(exhaustive_max_len + 1) for t in itertools.product(self.alphabet, repeat=n)]
        self.fixed = list(dict.fromkeys([*base, *extra]))
        self.calls = 0
        self.tested = 0

    def _random_batch(self) -> list[str]:
        rng = np.random.default_rng(np.random.SeedSequence([self.seed, self.calls]))
        lengths = rng.integers(0, self.random_max_len + 1, size=self.random_samples)
        k = len(self.alphabet)
        return ["".join(self.alphabet[i] for i in rng.integers(k, size=int(n))) for n in lengths]

    def find_counterexample(self, hypothesis: DFA) -> str | None:
        self.calls += 1
        suite = self.fixed + self._random_batch()
        self.tested += len(suite)
        answers = self.membership.query(suite)
        bad = [s for s, y in zip(suite, answers) if hypothesis.accepts(s) != y]
        return min(bad, key=lambda s: (len(s), s)) if bad else None


# =============================================================================
# L*
# =============================================================================
@dataclass
class LStarResult:
    dfa: DFA
    converged: bool
    stop_reason: str
    membership_queries: int
    equivalence_queries: int
    counterexamples: list[str]
    rounds: list[dict[str, Any]]
    closedness_fixes: int
    consistency_fixes: int
    table_shape: dict[str, int]
    seconds: float

    def summary(self) -> dict[str, Any]:
        return {
            "states": self.dfa.num_states,
            "converged": self.converged,
            "stop_reason": self.stop_reason,
            "membership_queries": self.membership_queries,
            "equivalence_queries": self.equivalence_queries,
            "counterexamples": len(self.counterexamples),
            "closedness_fixes": self.closedness_fixes,
            "consistency_fixes": self.consistency_fixes,
            "table_shape": self.table_shape,
            "learning_time_s": round(self.seconds, 4),
        }


class ObservationTable:
    def __init__(self, alphabet: Sequence[str], membership: MembershipOracle) -> None:
        self.alphabet = tuple(alphabet)
        self.membership = membership
        self.S: list[str] = [""]
        self.S_set: set[str] = {""}
        self.E: list[str] = [""]
        self.E_set: set[str] = {""}

    def extensions(self) -> list[str]:
        return [s + a for s in self.S for a in self.alphabet if s + a not in self.S_set]

    def fill(self) -> None:
        rows = self.S + self.extensions()
        self.membership.query([r + e for r in rows for e in self.E])

    def row(self, s: str) -> tuple[bool, ...]:
        cache = self.membership.cache
        return tuple(cache[s + e] for e in self.E)

    def add_to_S(self, strings: Iterable[str]) -> None:
        for s in strings:
            if s not in self.S_set:
                self.S.append(s)
                self.S_set.add(s)

    def add_to_E(self, suffixes: Iterable[str]) -> None:
        for e in suffixes:
            if e not in self.E_set:
                self.E.append(e)
                self.E_set.add(e)

    def distinct_rows(self) -> int:
        return len({self.row(s) for s in self.S})

    def unclosed(self) -> list[str]:
        """One representative per S·Σ row that no S row matches."""
        s_rows = {self.row(s) for s in self.S}
        missing: dict[tuple[bool, ...], str] = {}
        for t in self.extensions():
            r = self.row(t)
            if r not in s_rows and r not in missing:
                missing[r] = t
        return list(missing.values())

    def inconsistency(self) -> str | None:
        """A new experiment ``a·e`` separating two equal S rows, or ``None`` if consistent."""
        groups: dict[tuple[bool, ...], list[str]] = {}
        for s in self.S:
            groups.setdefault(self.row(s), []).append(s)
        cache = self.membership.cache
        for members in groups.values():
            if len(members) < 2:
                continue
            first = members[0]
            for other in members[1:]:
                for a in self.alphabet:
                    for e in self.E:
                        if cache[first + a + e] != cache[other + a + e]:
                            return a + e
        return None

    def hypothesis(self) -> DFA:
        index: dict[tuple[bool, ...], int] = {}
        access: list[str] = []
        for s in self.S:
            r = self.row(s)
            if r not in index:
                index[r] = len(access)
                access.append(s)
        delta = [[index[self.row(s + a)] for a in self.alphabet] for s in access]
        accepting = [i for i, s in enumerate(access) if self.membership.cache[s]]
        names = [f"q{i}" for i in range(len(access))]
        dfa = DFA(self.alphabet, delta, index[self.row("")], accepting, names)
        return dfa.trim().with_meta(access_strings={n: a for n, a in zip(names, access)})


def lstar(
    alphabet: Sequence[str],
    membership: MembershipOracle,
    equivalence: EquivalenceOracle,
    *,
    max_states: int = 64,
    max_queries: int = 400_000,
    max_seconds: float = 120.0,
    max_rounds: int = 200,
    counterexample_mode: str = "angluin",
) -> LStarResult:
    """Run L*.  Budgets are checked once per round; the last hypothesis is always returned."""
    if counterexample_mode not in {"angluin", "suffixes"}:
        raise ValueError("counterexample_mode must be 'angluin' or 'suffixes'")
    started = time.perf_counter()
    queries_before = membership.unique_queries
    table = ObservationTable(alphabet, membership)
    closed_fixes = consistent_fixes = 0
    counterexamples: list[str] = []
    rounds: list[dict[str, Any]] = []
    stop_reason = "equivalent"
    converged = False

    def over_budget() -> str | None:
        if membership.unique_queries - queries_before > max_queries:
            return "max_queries"
        if time.perf_counter() - started > max_seconds:
            return "max_seconds"
        return None

    hypothesis: DFA | None = None  # last complete hypothesis (always within the state budget)
    while True:
        # --- make the table closed and consistent ----------------------------------
        table.fill()
        exceeded = False
        while True:
            # A long counterexample can add many distinct rows at once; stop *before* the
            # table outgrows the budget and keep the previous (complete) hypothesis.
            if hypothesis is not None and table.distinct_rows() > max_states:
                exceeded = True
                break
            missing = table.unclosed()
            if missing:
                closed_fixes += len(missing)
                table.add_to_S(missing)
                table.fill()
                continue
            new_e = table.inconsistency()
            if new_e is not None:
                consistent_fixes += 1
                table.add_to_E([new_e])
                table.fill()
                continue
            break
        if exceeded:
            stop_reason = "max_states"
            rounds.append({"round": len(rounds) + 1, "states": None, "S": len(table.S), "E": len(table.E), "counterexample": None, "aborted": True})
            break
        hypothesis = table.hypothesis()
        record = {"round": len(rounds) + 1, "states": hypothesis.num_states, "S": len(table.S), "E": len(table.E)}
        # --- budgets --------------------------------------------------------------
        if hypothesis.num_states > max_states:
            stop_reason = "max_states"
            rounds.append(record | {"counterexample": None})
            break
        reason = over_budget()
        if reason:
            stop_reason = reason
            rounds.append(record | {"counterexample": None})
            break
        if len(rounds) >= max_rounds:
            stop_reason = "max_rounds"
            rounds.append(record | {"counterexample": None})
            break
        # --- equivalence query ----------------------------------------------------
        cex = equivalence.find_counterexample(hypothesis)
        rounds.append(record | {"counterexample": cex})
        if cex is None:
            converged = True
            stop_reason = "equivalent"
            break
        counterexamples.append(cex)
        if counterexample_mode == "angluin":
            table.add_to_S(cex[:i] for i in range(len(cex) + 1))
        else:
            table.add_to_E(cex[i:] for i in range(len(cex) + 1))

    assert hypothesis is not None
    return LStarResult(
        dfa=hypothesis.with_meta(learner="lstar", converged=converged, stop_reason=stop_reason),
        converged=converged,
        stop_reason=stop_reason,
        membership_queries=membership.unique_queries - queries_before,
        equivalence_queries=equivalence.calls,
        counterexamples=counterexamples,
        rounds=rounds,
        closedness_fixes=closed_fixes,
        consistency_fixes=consistent_fixes,
        table_shape={"S": len(table.S), "S_sigma": len(table.extensions()), "E": len(table.E)},
        seconds=time.perf_counter() - started,
    )


# =============================================================================
# Passive learning: PTA + red-blue state merging (RPNI, EDSM)
# =============================================================================
class _MergeState:
    """PTA with union-find classes; merges are recorded in an undo log."""

    def __init__(self, alphabet: Sequence[str], positives: Iterable[str], negatives: Iterable[str]) -> None:
        self.alphabet = tuple(alphabet)
        self.k = len(self.alphabet)
        idx = {a: i for i, a in enumerate(self.alphabet)}
        children: list[list[int]] = [[-1] * self.k]
        labels: list[int] = [-1]
        for s, lab in itertools.chain(((s, 1) for s in positives), ((s, 0) for s in negatives)):
            node = 0
            for ch in s:
                c = idx[ch]
                nxt = children[node][c]
                if nxt < 0:
                    nxt = len(children)
                    children.append([-1] * self.k)
                    labels.append(-1)
                    children[node][c] = nxt
                node = nxt
            if labels[node] >= 0 and labels[node] != lab:
                raise ValueError(f"inconsistent sample: {s!r} is labelled both accepted and rejected")
            labels[node] = lab
        # Renumber in BFS order so node ids follow the shortlex order of access strings.
        order = [0]
        for node in order:
            order.extend(c for c in children[node] if c >= 0)
        new = {old: i for i, old in enumerate(order)}
        self.child = [[new[c] if c >= 0 else -1 for c in children[old]] for old in order]
        self.label = [labels[old] for old in order]
        self.parent = list(range(len(order)))
        self.pta_size = len(order)

    def find(self, x: int) -> int:
        parent = self.parent
        while parent[x] != x:
            x = parent[x]
        return x

    def try_merge(self, red: int, blue: int) -> tuple[list[tuple[int, int, int, int]], int] | None:
        """Merge ``blue`` into ``red`` and fold; return (undo log, evidence score) or None."""
        log: list[tuple[int, int, int, int]] = []  # (kind, node, symbol, old): 0=parent, 1=label, 2=child
        score = 0
        stack = [(red, blue)]
        parent, label, child, find = self.parent, self.label, self.child, self.find
        while stack:
            a, b = stack.pop()
            ra, rb = find(a), find(b)
            if ra == rb:
                continue
            la, lb = label[ra], label[rb]
            if la >= 0 and lb >= 0:
                if la != lb:
                    self.undo(log)
                    return None
                score += 1
            log.append((0, rb, 0, parent[rb]))
            parent[rb] = ra
            if la < 0 and lb >= 0:
                log.append((1, ra, 0, la))
                label[ra] = lb
            for c in range(self.k):
                cb = child[rb][c]
                if cb < 0:
                    continue
                ca = child[ra][c]
                if ca < 0:
                    log.append((2, ra, c, ca))
                    child[ra][c] = cb
                else:
                    stack.append((ca, cb))
        return log, score

    def undo(self, log: list[tuple[int, int, int, int]]) -> None:
        for kind, node, c, old in reversed(log):
            if kind == 0:
                self.parent[node] = old
            elif kind == 1:
                self.label[node] = old
            else:
                self.child[node][c] = old
        log.clear()

    def blue_states(self, red: list[int]) -> list[int]:
        red_set = set(red)
        blue: set[int] = set()
        for r in red:
            for c in self.child[r]:
                if c >= 0:
                    rc = self.find(c)
                    if rc not in red_set:
                        blue.add(rc)
        return sorted(blue)

    def to_dfa(self, red: list[int], learner: str, extra_meta: dict[str, Any]) -> DFA:
        index = {r: i for i, r in enumerate(red)}
        delta: list[list[int | None]] = []
        for r in red:
            row: list[int | None] = []
            for c in self.child[r]:
                row.append(index[self.find(c)] if c >= 0 else None)
            delta.append(row)
        accepting = [i for i, r in enumerate(red) if self.label[r] == 1]
        meta = {"learner": learner, "pta_states": self.pta_size, **extra_meta}
        return DFA(self.alphabet, delta, 0, accepting, [f"p{i}" for i in range(len(red))], meta)


@dataclass
class PassiveResult:
    dfa: DFA  # minimized, total
    raw_dfa: DFA  # as produced by the merging (possibly partial)
    pta_states: int
    merges: int
    promotions: int
    merge_attempts: int
    seconds: float
    learner: str
    extra: dict[str, Any] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        return {
            "learner": self.learner,
            "states": self.dfa.num_states,
            "raw_states": self.raw_dfa.num_states,
            "pta_states": self.pta_states,
            "merges": self.merges,
            "promotions": self.promotions,
            "merge_attempts": self.merge_attempts,
            "learning_time_s": round(self.seconds, 4),
            **self.extra,
        }


def _split_sample(samples: Iterable[tuple[str, int | bool]]) -> tuple[list[str], list[str]]:
    pos, neg = [], []
    for s, y in samples:
        (pos if bool(y) else neg).append(s)
    return pos, neg


def rpni(alphabet: Sequence[str], samples: Iterable[tuple[str, int | bool]]) -> PassiveResult:
    """RPNI in the red-blue framework (blue states processed in shortlex order)."""
    started = time.perf_counter()
    pos, neg = _split_sample(samples)
    st = _MergeState(alphabet, pos, neg)
    red = [0]
    merges = promotions = attempts = 0
    while True:
        blue = st.blue_states(red)
        if not blue:
            break
        q = blue[0]
        for r in red:
            attempts += 1
            if st.try_merge(r, q) is not None:
                merges += 1
                break
        else:
            red.append(q)
            promotions += 1
    raw = st.to_dfa(red, "rpni", {})
    minimal = hopcroft_minimize(raw)  # completes (trap for unseen transitions) and minimizes
    minimal = minimal.with_meta(learner="rpni", raw_states=raw.num_states, pta_states=st.pta_size)
    return PassiveResult(minimal, raw, st.pta_size, merges, promotions, attempts, time.perf_counter() - started, "rpni")


def edsm(alphabet: Sequence[str], samples: Iterable[tuple[str, int | bool]], min_score: int = 0) -> PassiveResult:
    """Blue-fringe EDSM: promote blue states with no legal merge, else perform the best-scoring merge.

    ``min_score``: merges with evidence below this threshold count as illegal (0 = any legal merge).
    """
    started = time.perf_counter()
    pos, neg = _split_sample(samples)
    st = _MergeState(alphabet, pos, neg)
    red = [0]
    merges = promotions = attempts = 0
    while True:
        blue = st.blue_states(red)
        if not blue:
            break
        best: tuple[int, int, int] | None = None  # (score, red, blue)
        promoted = False
        for q in blue:
            q_best: tuple[int, int] | None = None
            for r in red:
                attempts += 1
                outcome = st.try_merge(r, q)
                if outcome is None:
                    continue
                log, score = outcome
                st.undo(log)
                if score >= min_score and (q_best is None or score > q_best[0]):
                    q_best = (score, r)
            if q_best is None:
                red.append(q)
                promotions += 1
                promoted = True
                break
            if best is None or q_best[0] > best[0]:
                best = (q_best[0], q_best[1], q)
        if promoted:
            continue
        assert best is not None
        _, r, q = best
        outcome = st.try_merge(r, q)
        assert outcome is not None
        merges += 1
    raw = st.to_dfa(red, "edsm", {})
    minimal = hopcroft_minimize(raw).with_meta(learner="edsm", raw_states=raw.num_states, pta_states=st.pta_size)
    return PassiveResult(minimal, raw, st.pta_size, merges, promotions, attempts, time.perf_counter() - started, "edsm")


def consistent_with(dfa: DFA, samples: Iterable[tuple[str, int | bool]]) -> bool:
    return all(dfa.accepts(s) == bool(y) for s, y in samples)
