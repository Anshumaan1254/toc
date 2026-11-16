"""Extract "the DFA a classifier has implicitly learned" with L* (model = membership oracle).

The trained pipeline answers membership queries (batched and cached: one ``predict`` call
per table fill, not one per string).  Equivalence queries are approximated by testing the
hypothesis against the model on

* every string of length 0..10 (2,047 strings for a binary alphabet),
* the training strings (only the model's answers are used, never their labels),
* 2,000 fresh uniform-random strings of length 0..40 per equivalence query,

and the *shortest* disagreement is returned as the counterexample.  Counterexamples are
handled with Angluin's original rule (every prefix is added to S, then the table is made
closed and consistent again).  Because a classifier's language need not be regular, the run
is bounded (states, unique queries, wall-clock, rounds) and reports ``converged``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Sequence

import numpy as np
from sklearn.pipeline import Pipeline

from ..automata.dfa import DFA
from ..automata.learners import LStarResult, MembershipOracle, SamplingEquivalenceOracle, lstar
from ..automata.minimize import hopcroft_minimize


@dataclass(frozen=True)
class ExtractionConfig:
    exhaustive_max_len: int = 10
    random_samples: int = 2000
    random_max_len: int = 40
    max_states: int = 64
    max_queries: int = 400_000
    max_seconds: float = 90.0
    max_rounds: int = 60
    counterexample_mode: str = "angluin"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def pipeline_oracle(pipe: Pipeline, batch_size: int = 8192) -> MembershipOracle:
    def answer(strings: Sequence[str]) -> list[bool]:
        return np.asarray(pipe.predict(list(strings))).astype(bool).tolist()

    return MembershipOracle(answer, batch_size=batch_size)


def extract_dfa(
    pipe: Pipeline,
    alphabet: Sequence[str],
    train_strings: Sequence[str],
    config: ExtractionConfig = ExtractionConfig(),
    seed: int = 42,
) -> tuple[DFA, LStarResult, MembershipOracle]:
    """Run L* against ``pipe``; return the minimized hypothesis, the raw result and the oracle."""
    oracle = pipeline_oracle(pipe)
    eq = SamplingEquivalenceOracle(
        oracle,
        alphabet,
        exhaustive_max_len=config.exhaustive_max_len,
        random_samples=config.random_samples,
        random_max_len=config.random_max_len,
        extra=train_strings,
        seed=seed,
    )
    result = lstar(
        alphabet,
        oracle,
        eq,
        max_states=config.max_states,
        max_queries=config.max_queries,
        max_seconds=config.max_seconds,
        max_rounds=config.max_rounds,
        counterexample_mode=config.counterexample_mode,
    )
    minimal = hopcroft_minimize(result.dfa).with_meta(
        learner="lstar",
        converged=result.converged,
        stop_reason=result.stop_reason,
        hypothesis_states=result.dfa.num_states,
        eq_strings_tested=eq.tested,
    )
    return minimal, result, oracle
