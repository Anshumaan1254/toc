"""Shared fixtures: random DFAs for property-based checks."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from src.automata.dfa import DFA


def random_dfa(rng: np.random.Generator, n_min: int = 1, n_max: int = 12, alphabet: str = "ab", partial: bool = False) -> DFA:
    n = int(rng.integers(n_min, n_max + 1))
    delta = []
    for _ in range(n):
        row = []
        for _ in alphabet:
            if partial and rng.random() < 0.15:
                row.append(None)
            else:
                row.append(int(rng.integers(n)))
        delta.append(row)
    accepting = [q for q in range(n) if rng.random() < 0.4]
    return DFA(tuple(alphabet), delta, 0, accepting)


def strings_up_to(alphabet: str, max_len: int) -> list[str]:
    return ["".join(t) for n in range(max_len + 1) for t in itertools.product(alphabet, repeat=n)]


@pytest.fixture(scope="session")
def rng() -> np.random.Generator:
    return np.random.default_rng(42)
