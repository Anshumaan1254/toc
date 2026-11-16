"""Generic, language-agnostic string features as a scikit-learn transformer.

Fairness rule: every feature is defined uniformly for *any* alphabet and *any* language;
nothing encodes a particular target language.  Some generic features happen to align with
some targets (a 3-gram count with "contains 101", count-mod-2 with "even number of 0s") -
that is reported, not hidden - while other targets (binary multiples of 3, interactions of
two residues) need structure that no feature provides.

Feature groups (binary alphabet -> 124 columns):

==================  ==========================================================
``len``, ``is_empty`` length and empty-string indicator
``count(a)``        1-gram counts = per-symbol counts
``ngram(w)``        counts of every 2-, 3- and 4-gram ``w``
``ratio(a)``        per-symbol count / length
``first[i]=a``      one-hot symbol at positions 1..6 from the start (``none`` = past the end)
``last[i]=a``       one-hot symbol at positions 1..6 from the end
``prefix=w``        one-hot prefix of length 2 and 3 (prefix/suffix patterns)
``suffix=w``        one-hot suffix of length 2 and 3
``max_run(a)``      longest run of each symbol
``changes``         number of adjacent positions with different symbols
``q%m=r``           one-hot residues of every symbol count and of the length, m in {2,3,4}
==================  ==========================================================

The implementation is fully vectorized (strings -> padded code matrix -> bincount), which
matters because the L* extraction sends hundreds of thousands of membership queries.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.utils.validation import check_is_fitted

PAD_NAME = "none"


def as_string_list(X: Any) -> list[str]:
    """Accept a list / tuple / 1-D array / Series / single-column DataFrame of ``str`` only."""
    if isinstance(X, pd.DataFrame):
        if X.shape[1] != 1:
            raise ValueError("expected a single column of strings")
        X = X.iloc[:, 0]
    if isinstance(X, pd.Series):
        values = X.tolist()
    elif isinstance(X, np.ndarray):
        if X.ndim == 2 and X.shape[1] == 1:
            X = X[:, 0]
        if X.ndim != 1:
            raise ValueError("expected a 1-D collection of strings")
        values = X.tolist()
    elif isinstance(X, str):
        raise TypeError("pass a collection of strings, not a single string")
    else:
        values = list(X)
    for v in values:
        if not isinstance(v, str):
            raise TypeError(f"every input must be a str, got {type(v).__name__}: {v!r} (NaN from a CSV round-trip?)")
    return values


class GenericStringFeatures(TransformerMixin, BaseEstimator):
    """Turn raw strings into the generic numeric features documented above."""

    def __init__(
        self,
        alphabet: str | None = None,
        max_ngram: int = 4,
        n_positions: int = 6,
        affix_lengths: tuple[int, ...] = (2, 3),
        moduli: tuple[int, ...] = (2, 3, 4),
    ) -> None:
        self.alphabet = alphabet
        self.max_ngram = max_ngram
        self.n_positions = n_positions
        self.affix_lengths = affix_lengths
        self.moduli = moduli

    # ------------------------------------------------------------------ sklearn API
    def fit(self, X: Any, y: Any = None) -> "GenericStringFeatures":
        strings = as_string_list(X)
        alphabet = self.alphabet if self.alphabet is not None else "".join(sorted(set("".join(strings))))
        if not alphabet or len(set(alphabet)) != len(alphabet):
            raise ValueError(f"invalid alphabet {alphabet!r}")
        self.alphabet_ = tuple(alphabet)
        self.feature_names_ = np.array(self._names(), dtype=object)
        self.n_features_in_ = 1
        return self

    def get_feature_names_out(self, input_features: Any = None) -> np.ndarray:
        check_is_fitted(self, "feature_names_")
        return self.feature_names_.copy()

    def transform(self, X: Any) -> np.ndarray:
        check_is_fitted(self, "alphabet_")
        strings = as_string_list(X)
        codes, lengths = self._encode(strings)
        blocks = self._blocks(codes, lengths)
        out = np.hstack(blocks).astype(np.float64, copy=False)
        assert out.shape[1] == len(self.feature_names_)
        return out

    # ------------------------------------------------------------------ helpers
    def _names(self) -> list[str]:
        a = self.alphabet_
        k = len(a)
        names = ["len", "is_empty"]
        for n in range(1, self.max_ngram + 1):
            for idx in range(k**n):
                w = self._decode(idx, n)
                names.append(f"count({w})" if n == 1 else f"ngram({w})")
        names += [f"ratio({s})" for s in a]
        for side in ("first", "last"):
            for i in range(1, self.n_positions + 1):
                names += [f"{side}[{i}]={s}" for s in a] + [f"{side}[{i}]={PAD_NAME}"]
        for side in ("prefix", "suffix"):
            for m in self.affix_lengths:
                names += [f"{side}={self._decode(idx, m)}" for idx in range(k**m)]
        names += [f"max_run({s})" for s in a]
        names.append("changes")
        for q in [f"count({s})" for s in a] + ["len"]:
            for m in self.moduli:
                names += [f"{q}%{m}={r}" for r in range(m)]
        return names

    def _decode(self, idx: int, n: int) -> str:
        k = len(self.alphabet_)
        out = []
        for _ in range(n):
            idx, rem = divmod(idx, k)
            out.append(self.alphabet_[rem])
        return "".join(reversed(out))

    def _encode(self, strings: Sequence[str]) -> tuple[np.ndarray, np.ndarray]:
        n = len(strings)
        lengths = np.fromiter((len(s) for s in strings), dtype=np.int64, count=n)
        width = max(int(lengths.max(initial=0)), 1)
        codes = np.full((n, width), -1, dtype=np.int64)
        total = int(lengths.sum())
        if total:
            joined = "".join(strings)
            try:
                raw = np.frombuffer(joined.encode("latin-1"), dtype=np.uint8)
                lut = np.full(256, -1, dtype=np.int64)
                for i, s in enumerate(self.alphabet_):
                    if ord(s) > 255:
                        raise UnicodeEncodeError("latin-1", s, 0, 1, "non latin-1 symbol")
                    lut[ord(s)] = i
                flat = lut[raw]
            except UnicodeEncodeError:
                index = {s: i for i, s in enumerate(self.alphabet_)}
                flat = np.array([index.get(ch, -1) for ch in joined], dtype=np.int64)
            if (flat < 0).any():
                bad = sorted({ch for ch in joined if ch not in self.alphabet_})
                raise ValueError(f"symbols {bad} are not in the alphabet {''.join(self.alphabet_)!r}")
            rows = np.repeat(np.arange(n), lengths)
            starts = np.concatenate([[0], np.cumsum(lengths)[:-1]])
            cols = np.arange(total) - np.repeat(starts, lengths)
            codes[rows, cols] = flat
        return codes, lengths

    def _blocks(self, codes: np.ndarray, lengths: np.ndarray) -> list[np.ndarray]:
        n, width = codes.shape
        k = len(self.alphabet_)
        safe = np.where(codes < 0, 0, codes)
        rows = np.arange(n)
        blocks: list[np.ndarray] = [lengths[:, None].astype(float), (lengths == 0)[:, None].astype(float)]

        # n-gram counts (n = 1 gives the per-symbol counts)
        counts1 = None
        for m in range(1, self.max_ngram + 1):
            vocab = k**m
            if width >= m:
                windows = width - m + 1
                code = np.zeros((n, windows), dtype=np.int64)
                for j in range(m):
                    code = code * k + safe[:, j : j + windows]
                valid = (np.arange(windows)[None, :] + m) <= lengths[:, None]
                flat = (rows[:, None] * vocab + code)[valid]
                block = np.bincount(flat, minlength=n * vocab).reshape(n, vocab)
            else:
                block = np.zeros((n, vocab), dtype=np.int64)
            if m == 1:
                counts1 = block
            blocks.append(block)
        assert counts1 is not None
        blocks.append(counts1 / np.maximum(lengths, 1)[:, None])

        # positional one-hot: first / last n_positions symbols (PAD = k)
        for side in ("first", "last"):
            for i in range(self.n_positions):
                if side == "first":
                    pos = np.full(n, i)
                else:
                    pos = lengths - 1 - i
                ok = (pos >= 0) & (pos < lengths)
                sym = np.full(n, k)
                if width:
                    sym[ok] = codes[rows[ok], pos[ok]]
                onehot = np.zeros((n, k + 1))
                onehot[rows, sym] = 1.0
                blocks.append(onehot)

        # prefix / suffix patterns of fixed lengths
        for side in ("prefix", "suffix"):
            for m in self.affix_lengths:
                onehot = np.zeros((n, k**m))
                ok = lengths >= m
                if ok.any():
                    sel = rows[ok]
                    code = np.zeros(len(sel), dtype=np.int64)
                    for j in range(m):
                        idx = np.full(len(sel), j) if side == "prefix" else lengths[ok] - m + j
                        code = code * k + codes[sel, idx]
                    onehot[sel, code] = 1.0
                blocks.append(onehot)

        # longest run per symbol and number of symbol changes
        longest = np.zeros((n, k))
        changes = np.zeros(n)
        if width:
            run = (lengths > 0).astype(np.int64)
            for s in range(k):
                longest[:, s] = np.where((codes[:, 0] == s) & (lengths > 0), 1, 0)
            for i in range(1, width):
                valid = i < lengths
                same = (codes[:, i] == codes[:, i - 1]) & valid
                changes += ((codes[:, i] != codes[:, i - 1]) & valid).astype(float)
                run = np.where(same, run + 1, np.where(valid, 1, run))
                for s in range(k):
                    hit = valid & (codes[:, i] == s)
                    longest[:, s] = np.where(hit, np.maximum(longest[:, s], run), longest[:, s])
        blocks.append(longest)
        blocks.append(changes[:, None])

        # residues of every symbol count and of the length
        quantities = [counts1[:, s] for s in range(k)] + [lengths]
        for q in quantities:
            for m in self.moduli:
                onehot = np.zeros((n, m))
                onehot[rows, (q % m).astype(np.int64)] = 1.0
                blocks.append(onehot)
        return blocks


def describe_features(names: Iterable[str]) -> dict[str, int]:
    """Count columns per feature group (for the notebook's feature table)."""
    groups: dict[str, int] = {}
    for name in names:
        if "%" in name:
            g = "count / length mod k (one-hot)"
        elif name.startswith(("first[", "last[")):
            g = "positional one-hot (first/last 6)"
        elif name.startswith(("prefix=", "suffix=")):
            g = "prefix / suffix patterns"
        elif name.startswith("count("):
            g = "1-gram = per-symbol counts"
        elif name.startswith("ngram("):
            g = "2..4-gram counts"
        elif name.startswith("ratio("):
            g = "per-symbol ratios"
        elif name.startswith("max_run("):
            g = "longest run per symbol"
        else:
            g = name
        groups[g] = groups.get(g, 0) + 1
    return groups
