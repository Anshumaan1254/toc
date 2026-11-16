"""Dataset generation for the target languages.

Labels come **only** from the ground-truth DFA.  Per language the dataset contains:

* every string of length 0..10 (``exhaustive``) - complete short-string coverage;
* sampled buckets 11-15 and 16-20 (pool ``main``) and 21-30 and 31-40 (pool ``long``,
  the length-generalization set that is never used for training).  Each sampled bucket is
  exactly class-balanced and mixes several generation strategies:

  - ``dfa_uniform_positive`` / ``dfa_uniform_negative``: *uniform* samples from the accepted
    (rejected) strings of a given length, drawn exactly with a counting DP over the DFA;
  - ``hard_negative_edit``: 1-2 random edits (substitute / insert / delete) of a positive
    string that land outside the language - negatives right next to the boundary;
  - ``near_miss_positive_edit``: the mirror image - edits of negatives that land inside;
  - ``structured_run`` / ``structured_repeat`` / ``structured_palindrome``: long runs,
    periodic patterns and palindromes, labelled by the DFA.

Exhaustive buckets keep the language's natural class ratio (e.g. L8 has no positives at
lengths that are not multiples of 4): coverage is prioritised over balance there, and the
balance table in the dataset report shows it honestly.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from itertools import product
from typing import Any, Iterable

import numpy as np
import pandas as pd

from ..automata.dfa import DFA
from ..automata.equivalence import are_equivalent
from ..automata.languages import LANGUAGES, Language
from ..automata.nfa import subset_construction


@dataclass(frozen=True)
class Bucket:
    lo: int
    hi: int
    pool: str  # "main" (train/val/test pool) or "long" (generalization pool)
    size: int | None  # None => exhaustive

    @property
    def label(self) -> str:
        return f"{self.lo}-{self.hi}"


@dataclass(frozen=True)
class DatasetConfig:
    seed: int = 42
    buckets: tuple[Bucket, ...] = (
        Bucket(0, 5, "main", None),
        Bucket(6, 10, "main", None),
        Bucket(11, 15, "main", 1500),
        Bucket(16, 20, "main", 1500),
        Bucket(21, 30, "long", 1000),
        Bucket(31, 40, "long", 1000),
    )
    hard_negative_share: float = 0.40  # of the negatives in each sampled bucket
    near_miss_positive_share: float = 0.15  # of the positives in each sampled bucket
    structured_share: float = 0.10  # of each class in each sampled bucket
    max_attempts_factor: int = 400  # attempt budget per requested string (guards infinite loops)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["buckets"] = [asdict(b) | {"label": b.label} for b in self.buckets]
        return d


COLUMNS = [
    "language_id",
    "alphabet",
    "string",
    "label",
    "length",
    "split_hint",
    "generation_strategy",
    "length_bucket",
]


def all_strings(alphabet: Iterable[str], max_len: int, min_len: int = 0) -> list[str]:
    """Every string over ``alphabet`` with ``min_len <= length <= max_len`` in shortlex order."""
    alphabet = tuple(alphabet)
    out: list[str] = []
    for n in range(min_len, max_len + 1):
        out.extend("".join(t) for t in product(alphabet, repeat=n))
    return out


class LanguageSampler:
    """Exact uniform sampling of accepted / rejected strings of a fixed length."""

    def __init__(self, dfa: DFA, max_len: int, rng: np.random.Generator) -> None:
        self.pos = dfa.complete()
        self.neg = self.pos.complement()
        self.rng = rng
        self.tables = {True: self.pos.count_table(max_len), False: self.neg.count_table(max_len)}

    def count(self, length: int, accepted: bool) -> int:
        d = self.pos if accepted else self.neg
        return self.tables[accepted][length][d.start]

    def sample(self, length: int, accepted: bool) -> str | None:
        d = self.pos if accepted else self.neg
        table = self.tables[accepted]
        q = d.start
        if table[length][q] == 0:
            return None
        out = []
        for r in range(length, 0, -1):
            x = int(self.rng.integers(table[r][q]))
            for c, a in enumerate(d.alphabet):
                nxt = d.delta[q][c]
                cnt = table[r - 1][nxt]  # type: ignore[index]
                if x < cnt:
                    out.append(a)
                    q = nxt  # type: ignore[assignment]
                    break
                x -= cnt
        return "".join(out)


class _LanguageGenerator:
    def __init__(self, lang: Language, config: DatasetConfig, rng: np.random.Generator) -> None:
        self.lang = lang
        self.config = config
        self.rng = rng
        self.dfa = lang.dfa
        self.sampler = LanguageSampler(lang.dfa, max(b.hi for b in config.buckets), rng)
        self.seen: set[str] = set()
        self.rows: list[dict[str, Any]] = []
        self.duplicates: Counter[str] = Counter()
        self.shortfalls: list[str] = []

    # ---------------------------------------------------------------- helpers
    def label(self, s: str) -> int:
        return int(self.dfa.accepts(s))

    def add(self, s: str, strategy: str, bucket: Bucket) -> bool:
        if s in self.seen:
            self.duplicates[strategy] += 1
            return False
        self.seen.add(s)
        self.rows.append(
            {
                "language_id": self.lang.id,
                "alphabet": self.lang.alphabet_str,
                "string": s,
                "label": self.label(s),
                "length": len(s),
                "split_hint": bucket.pool,
                "generation_strategy": strategy,
                "length_bucket": bucket.label,
            }
        )
        return True

    def random_string(self, n: int) -> str:
        alphabet = self.lang.alphabet
        return "".join(alphabet[i] for i in self.rng.integers(len(alphabet), size=n)) if n else ""

    def random_edit(self, s: str) -> str:
        """Apply 1 (60%) or 2 (40%) random substitute / insert / delete edits."""
        chars = list(s)
        alphabet = self.lang.alphabet
        n_edits = 1 if self.rng.random() < 0.6 else 2
        for _ in range(n_edits):
            ops = ["insert"] if not chars else ["substitute", "insert", "delete"]
            op = ops[int(self.rng.integers(len(ops)))]
            if op == "substitute":
                i = int(self.rng.integers(len(chars)))
                choices = [a for a in alphabet if a != chars[i]]
                chars[i] = choices[int(self.rng.integers(len(choices)))]
            elif op == "insert":
                i = int(self.rng.integers(len(chars) + 1))
                chars.insert(i, alphabet[int(self.rng.integers(len(alphabet)))])
            else:
                del chars[int(self.rng.integers(len(chars)))]
        return "".join(chars)

    def structured(self, lo: int, hi: int) -> tuple[str, str]:
        """One structured string: runs, a repeated short pattern, or a palindrome."""
        n = int(self.rng.integers(lo, hi + 1))
        kind = ("run", "repeat", "palindrome")[int(self.rng.integers(3))]
        alphabet = self.lang.alphabet
        if kind == "run":
            k = int(self.rng.integers(1, 4))
            cuts = sorted(int(c) for c in self.rng.integers(0, n + 1, size=k - 1))
            lengths = [b - a for a, b in zip([0, *cuts], [*cuts, n])]
            first = int(self.rng.integers(len(alphabet)))
            s = "".join(alphabet[(first + j) % len(alphabet)] * m for j, m in enumerate(lengths))
        elif kind == "repeat":
            pattern = self.random_string(int(self.rng.integers(1, 5)))
            s = (pattern * (n // len(pattern) + 1))[:n]
        else:
            half = self.random_string(n // 2)
            mid = self.random_string(n % 2)
            s = half + mid + half[::-1]
        return s, f"structured_{kind}"

    # ---------------------------------------------------------------- buckets
    def fill_exhaustive(self, bucket: Bucket) -> None:
        for s in all_strings(self.lang.alphabet, bucket.hi, bucket.lo):
            self.add(s, "exhaustive", bucket)

    def fill_sampled(self, bucket: Bucket) -> None:
        assert bucket.size is not None
        cfg = self.config
        lo, hi = bucket.lo, bucket.hi
        n_pos = bucket.size // 2
        n_neg = bucket.size - n_pos
        pos_lengths = [n for n in range(lo, hi + 1) if self.sampler.count(n, True) > 0]
        neg_lengths = [n for n in range(lo, hi + 1) if self.sampler.count(n, False) > 0]
        counts = {1: 0, 0: 0}
        bucket_pos: list[str] = []

        def take(s: str | None, strategy: str, want: int) -> bool:
            if s is None or not (lo <= len(s) <= hi) or self.label(s) != want or counts[want] >= (n_pos if want else n_neg):
                return False
            if self.add(s, strategy, bucket):
                counts[want] += 1
                if want == 1:
                    bucket_pos.append(s)
                return True
            return False

        def run(target: int, make, strategy_of, want: int) -> None:
            got, attempts = 0, 0
            budget = max(1, target) * cfg.max_attempts_factor
            while got < target and attempts < budget and counts[want] < (n_pos if want else n_neg):
                attempts += 1
                s, strategy = make()
                if take(s, strategy_of(strategy), want):
                    got += 1

        # 1) structured strings of both classes
        for want, n_class in ((1, n_pos), (0, n_neg)):
            run(round(cfg.structured_share * n_class), lambda: self.structured(lo, hi), lambda st: st, want)
        # 2) near-miss positives: edits of uniform negatives that land inside the language
        if pos_lengths and neg_lengths:
            run(
                round(cfg.near_miss_positive_share * n_pos),
                lambda: (self.random_edit(self.sampler.sample(int(self.rng.choice(neg_lengths)), False) or ""), "near_miss_positive_edit"),
                lambda st: st,
                1,
            )
        # 3) remaining positives: exact uniform samples
        if pos_lengths:
            run(
                n_pos - counts[1],
                lambda: (self.sampler.sample(int(self.rng.choice(pos_lengths)), True), "dfa_uniform_positive"),
                lambda st: st,
                1,
            )
        # 4) hard negatives: edits of this bucket's positives that land outside the language
        if bucket_pos:
            run(
                round(cfg.hard_negative_share * n_neg),
                lambda: (self.random_edit(bucket_pos[int(self.rng.integers(len(bucket_pos)))]), "hard_negative_edit"),
                lambda st: st,
                0,
            )
        # 5) remaining negatives: exact uniform samples
        if neg_lengths:
            run(
                n_neg - counts[0],
                lambda: (self.sampler.sample(int(self.rng.choice(neg_lengths)), False), "dfa_uniform_negative"),
                lambda st: st,
                0,
            )
        if counts[1] < n_pos or counts[0] < n_neg:
            self.shortfalls.append(f"{self.lang.id} bucket {bucket.label}: pos {counts[1]}/{n_pos}, neg {counts[0]}/{n_neg}")

    def generate(self) -> list[dict[str, Any]]:
        for bucket in self.config.buckets:
            if bucket.size is None:
                self.fill_exhaustive(bucket)
            else:
                self.fill_sampled(bucket)
        return self.rows


def cross_check_labels(lang: Language, strings: Iterable[str]) -> dict[str, Any]:
    """Assert DFA labels agree with every independent definition of the language.

    Checks per string: hand NFA simulation, subset-construction DFA of that NFA, Thompson
    ε-NFA of the regex (via its subset DFA), the Python predicate and Python's ``re``.
    Also proves whole-language equivalence of the DFA with both subset DFAs (product
    construction), which covers strings outside the sample too.
    """
    strings = list(strings)
    dfa = lang.dfa
    nfa = lang.nfa
    nfa_dfa, _ = subset_construction(nfa)
    thompson_dfa, _ = subset_construction(lang.thompson_nfa)
    pattern = re.compile(lang.regex)
    assert are_equivalent(dfa, nfa_dfa), f"{lang.id}: DFA and subset(NFA) differ"
    assert are_equivalent(dfa, thompson_dfa), f"{lang.id}: DFA and subset(Thompson(regex)) differ"
    for s in strings:
        y = dfa.accepts(s)
        assert y == nfa.accepts(s), (lang.id, s, "NFA simulation")
        assert y == nfa_dfa.accepts(s), (lang.id, s, "subset DFA")
        assert y == thompson_dfa.accepts(s), (lang.id, s, "Thompson subset DFA")
        assert y == bool(lang.predicate(s)), (lang.id, s, "predicate")
        assert y == bool(pattern.fullmatch(s)), (lang.id, s, "python re")
    return {
        "language_id": lang.id,
        "strings_checked": len(strings),
        "nfa_states": nfa.num_states,
        "nfa_has_epsilon": nfa.has_epsilon,
        "subset_dfa_states": nfa_dfa.num_states,
        "thompson_nfa_states": lang.thompson_nfa.num_states,
        "thompson_subset_dfa_states": thompson_dfa.num_states,
        "equivalent_to_subset_dfa": True,
        "equivalent_to_thompson_dfa": True,
    }


def build_dataset(
    config: DatasetConfig | None = None, languages: Iterable[str] | None = None
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Generate the full dataset and a machine-readable report."""
    config = config or DatasetConfig()
    ids = list(languages) if languages is not None else list(LANGUAGES)
    frames = []
    duplicates: dict[str, dict[str, int]] = {}
    shortfalls: list[str] = []
    for i, lid in enumerate(ids):
        rng = np.random.default_rng(np.random.SeedSequence([config.seed, i]))
        gen = _LanguageGenerator(LANGUAGES[lid], config, rng)
        frames.append(pd.DataFrame(gen.generate(), columns=COLUMNS))
        duplicates[lid] = dict(gen.duplicates)
        shortfalls.extend(gen.shortfalls)
    df = pd.concat(frames, ignore_index=True)
    order = {lid: k for k, lid in enumerate(ids)}
    df["_lang_order"] = df["language_id"].map(order)
    df["_pool_order"] = (df["split_hint"] == "long").astype(int)
    df = df.sort_values(["_lang_order", "_pool_order", "length", "string"], kind="stable")
    df = df.drop(columns=["_lang_order", "_pool_order"]).reset_index(drop=True)
    df["label"] = df["label"].astype("int64")
    df["length"] = df["length"].astype("int64")
    report = dataset_report(df, config, duplicates, shortfalls)
    return df, report


def dataset_report(
    df: pd.DataFrame,
    config: DatasetConfig,
    duplicates: dict[str, dict[str, int]] | None = None,
    shortfalls: list[str] | None = None,
) -> dict[str, Any]:
    """Counts per language, class balance (overall and per length bucket), lengths, strategies."""
    per_lang = (
        df.groupby("language_id", sort=False)
        .agg(rows=("string", "size"), positives=("label", "sum"), min_len=("length", "min"), max_len=("length", "max"))
        .reset_index()
    )
    per_lang["negatives"] = per_lang["rows"] - per_lang["positives"]
    per_lang["positive_rate"] = (per_lang["positives"] / per_lang["rows"]).round(4)
    per_bucket = (
        df.groupby(["language_id", "split_hint", "length_bucket"], sort=False)
        .agg(rows=("string", "size"), positives=("label", "sum"))
        .reset_index()
    )
    per_bucket["negatives"] = per_bucket["rows"] - per_bucket["positives"]
    per_bucket["positive_rate"] = (per_bucket["positives"] / per_bucket["rows"]).round(4)
    exhaustive_labels = {b.label for b in config.buckets if b.size is None}
    per_bucket["balanced_by_design"] = ~per_bucket["length_bucket"].isin(exhaustive_labels)
    strategies = df.groupby(["language_id", "generation_strategy"], sort=False).size().unstack(fill_value=0)
    lengths = df.groupby(["split_hint", "length"]).size().unstack(level=0, fill_value=0)
    dup_total = {lid: int(sum(v.values())) for lid, v in (duplicates or {}).items()}
    return {
        "config": config.to_dict(),
        "total_rows": int(len(df)),
        "languages": per_lang.to_dict(orient="records"),
        "per_bucket": per_bucket.to_dict(orient="records"),
        "strategies": {lid: {k: int(v) for k, v in row.items()} for lid, row in strategies.iterrows()},
        "length_distribution": {str(pool): {int(k): int(v) for k, v in col.items()} for pool, col in lengths.items()},
        "duplicates_removed": {"total": int(sum(dup_total.values())), "per_language": dup_total, "per_strategy": duplicates or {}},
        "shortfalls": shortfalls or [],
    }


def report_markdown(report: dict[str, Any]) -> str:
    """Human-readable version of :func:`dataset_report` (saved as ``data/dataset_report.md``)."""
    langs = pd.DataFrame(report["languages"])
    buckets = pd.DataFrame(report["per_bucket"])
    pivot = buckets.pivot_table(index="language_id", columns="length_bucket", values="positive_rate", sort=False)
    pivot = pivot[[b["label"] for b in report["config"]["buckets"]]]
    strategies = pd.DataFrame(report["strategies"]).T.fillna(0).astype(int)
    dups = report["duplicates_removed"]

    def table(frame: pd.DataFrame, index: bool = False) -> str:
        frame = frame.reset_index() if index else frame
        cols = [str(c) for c in frame.columns]
        lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
        for row in frame.itertuples(index=False):
            lines.append("| " + " | ".join(str(v) for v in row) + " |")
        return "\n".join(lines)

    parts = [
        "# Dataset report",
        "",
        f"Total rows: **{report['total_rows']:,}** · seed {report['config']['seed']} · "
        f"duplicates removed during generation: **{dups['total']:,}**",
        "",
        "## Rows and class balance per language",
        table(langs[["language_id", "rows", "positives", "negatives", "positive_rate", "min_len", "max_len"]]),
        "",
        "## Positive rate per length bucket",
        "Buckets 0-5 and 6-10 are exhaustive (natural class ratio); all other buckets are balanced by construction.",
        "",
        table(pivot.round(3), index=True),
        "",
        "## Generation strategies",
        table(strategies, index=True),
        "",
        "## Duplicates removed per language",
        table(pd.DataFrame([dups["per_language"]]).T.rename(columns={0: "duplicates_removed"}), index=True),
        "",
        f"Shortfalls: {report['shortfalls'] or 'none'}",
        "",
    ]
    return "\n".join(parts)
